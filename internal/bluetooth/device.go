// Package bluetooth 蓝牙设备管理
package bluetooth

import (
	"bufio"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"

	"bluetooth-device-go/internal/communication"
	"bluetooth-device-go/internal/logger"
	"bluetooth-device-go/internal/protocol"
	"bluetooth-device-go/internal/utils"
)

// 厂商字典
var manufacturerDict = map[string]string{
	"0001": "Nokia Mobile Phones",
	"0008": "Motorola",
	"004C": "Apple, Inc.",
	"0056": "Sony Ericsson Mobile Communications",
	"0075": "Samsung Electronics Co. Ltd.",
	"00C4": "LG Electronics",
	"00E0": "Google",
}

// InitializeState 初始化状态
type InitializeState string

const (
	StateUninitialized InitializeState = "uninitialized"
	StateInitializing  InitializeState = "initializing"
	StateInitialized   InitializeState = "initialized"
)

// DeviceStatus 设备状态
type DeviceStatus struct {
	Connected       bool            `json:"connected"`
	InitializeState InitializeState `json:"initializeState"`
	IsScanning      bool            `json:"isScanning"`
}

// BlueDeviceConfig 蓝牙设备配置
type BlueDeviceConfig struct {
	SerialPath     string // 串口路径
	DeviceID       string // 设备ID
	ReportInterval int    // 上报间隔（毫秒）
	RSSI           string // 默认RSSI阈值
}

// BlueDevice 蓝牙设备
type BlueDevice struct {
	config           BlueDeviceConfig
	port             serial.Port
	scanner          *bufio.Scanner
	initializeState  InitializeState
	isScanning       bool
	enableReport     bool
	deleteDeviceList map[string]bool // 用于去重的设备列表
	deviceEvents     chan communication.DeviceEventData
	mutex            sync.RWMutex
	stopChan         chan struct{}
	logger           *logger.Logger
}

// NewBlueDevice 创建新的蓝牙设备
func NewBlueDevice(config BlueDeviceConfig) *BlueDevice {
	return &BlueDevice{
		config:           config,
		initializeState:  StateUninitialized,
		isScanning:       false,
		enableReport:     false,
		deleteDeviceList: make(map[string]bool),
		deviceEvents:     make(chan communication.DeviceEventData, 100),
		stopChan:         make(chan struct{}),
		logger:           logger.GetLogger(),
	}
}

// Connect 连接串口
func (bd *BlueDevice) Connect() error {
	mode := &serial.Mode{
		BaudRate: 115200,
		DataBits: 8,
		StopBits: serial.OneStopBit,
		Parity:   serial.NoParity,
	}

	port, err := serial.Open(bd.config.SerialPath, mode)
	if err != nil {
		return fmt.Errorf("failed to open serial port %s: %w", bd.config.SerialPath, err)
	}

	bd.port = port
	bd.scanner = bufio.NewScanner(port)

	bd.logger.Infof("BlueDevice", "[%s] 串口连接成功: %s", bd.config.DeviceID, bd.config.SerialPath)

	// 启动数据读取协程
	go bd.readData()

	return nil
}

// Disconnect 断开连接
func (bd *BlueDevice) Disconnect() error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	// 停止扫描
	if bd.isScanning {
		bd.stopScan()
	}

	// 停止上报
	bd.enableReport = false

	// 发送停止信号
	close(bd.stopChan)

	// 关闭串口
	if bd.port != nil {
		err := bd.port.Close()
		bd.port = nil
		return err
	}

	return nil
}

// Send 发送数据
func (bd *BlueDevice) Send(data string) error {
	bd.mutex.RLock()
	defer bd.mutex.RUnlock()

	if bd.port == nil {
		return fmt.Errorf("serial port not connected")
	}

	bd.logger.Debugf("BlueDevice", "[%s] 发送数据: %s", bd.config.DeviceID, strings.TrimSpace(data))

	_, err := bd.port.Write([]byte(data))
	if err != nil {
		bd.logger.Errorf("BlueDevice", "[%s] 发送数据失败: %v", bd.config.DeviceID, err)
		return fmt.Errorf("failed to write to serial port: %w", err)
	}

	return nil
}

// SendAndSleep 发送数据并等待
func (bd *BlueDevice) SendAndSleep(data string, sleepTime int) error {
	if err := bd.Send(data); err != nil {
		return err
	}

	if sleepTime > 0 {
		utils.Sleep(sleepTime)
	}

	return nil
}

// Initialize 初始化设备
func (bd *BlueDevice) Initialize() error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	if bd.initializeState == StateInitializing || bd.initializeState == StateInitialized {
		return nil
	}

	bd.logger.Infof("BlueDevice", "[%s] 开始初始化设备...", bd.config.DeviceID)
	bd.initializeState = StateInitializing

	// 重启设备
	if err := bd.SendAndSleep(protocol.BuildRestartCommand(), 3000); err != nil {
		return fmt.Errorf("failed to restart device: %w", err)
	}

	// 进入AT命令模式
	if err := bd.SendAndSleep(protocol.BuildEnterCommandMode(), 500); err != nil {
		return fmt.Errorf("failed to enter command mode: %w", err)
	}

	// 设置设备为单主角色
	if err := bd.SendAndSleep(protocol.BuildSetRoleCommand(), 500); err != nil {
		return fmt.Errorf("failed to set role: %w", err)
	}

	// 重启设备
	if err := bd.SendAndSleep(protocol.BuildRestartCommand(), 2000); err != nil {
		return fmt.Errorf("failed to restart device after role setting: %w", err)
	}

	// 进入AT命令模式
	if err := bd.SendAndSleep(protocol.BuildEnterCommandMode(), 1000); err != nil {
		return fmt.Errorf("failed to enter command mode after restart: %w", err)
	}

	bd.initializeState = StateInitialized

	// 开始扫描
	if err := bd.StartScan(bd.config.RSSI); err != nil {
		return fmt.Errorf("failed to start scan: %w", err)
	}

	bd.logger.Infof("BlueDevice", "[%s] 设备初始化完成", bd.config.DeviceID)
	return nil
}

// StartScan 开始扫描
func (bd *BlueDevice) StartScan(rssi string) error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	if bd.isScanning {
		bd.logger.Warnf("BlueDevice", "[%s] 设备已在扫描中", bd.config.DeviceID)
		return nil
	}

	if rssi == "" {
		rssi = bd.config.RSSI
	}

	bd.logger.Infof("BlueDevice", "[%s] 开始扫描，RSSI阈值: %s", bd.config.DeviceID, rssi)

	if err := bd.Send(protocol.BuildObserverCommand(rssi)); err != nil {
		return fmt.Errorf("failed to start observer: %w", err)
	}

	bd.isScanning = true
	return nil
}

// StopScan 停止扫描
func (bd *BlueDevice) StopScan() error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	return bd.stopScan()
}

// stopScan 内部停止扫描方法（不加锁）
func (bd *BlueDevice) stopScan() error {
	if !bd.isScanning {
		return nil
	}

	bd.logger.Infof("BlueDevice", "[%s] 停止扫描", bd.config.DeviceID)

	if err := bd.Send(protocol.BuildStopObserverCommand()); err != nil {
		return fmt.Errorf("failed to stop observer: %w", err)
	}

	bd.isScanning = false
	return nil
}

// StartReport 开始上报
func (bd *BlueDevice) StartReport() {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	bd.enableReport = true
	bd.deleteDeviceList = make(map[string]bool) // 清空设备列表
	bd.logger.Infof("BlueDevice", "[%s] 开始上报设备事件", bd.config.DeviceID)
}

// StopReport 停止上报
func (bd *BlueDevice) StopReport() {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	bd.enableReport = false
	bd.logger.Infof("BlueDevice", "[%s] 停止上报设备事件", bd.config.DeviceID)
}

// GetStatus 获取设备状态
func (bd *BlueDevice) GetStatus() DeviceStatus {
	bd.mutex.RLock()
	defer bd.mutex.RUnlock()

	return DeviceStatus{
		Connected:       bd.port != nil,
		InitializeState: bd.initializeState,
		IsScanning:      bd.isScanning,
	}
}

// GetDeviceID 获取设备ID
func (bd *BlueDevice) GetDeviceID() string {
	return bd.config.DeviceID
}

// GetSerialPath 获取串口路径
func (bd *BlueDevice) GetSerialPath() string {
	return bd.config.SerialPath
}

// GetDeviceEvents 获取设备事件通道
func (bd *BlueDevice) GetDeviceEvents() <-chan communication.DeviceEventData {
	return bd.deviceEvents
}

// readData 读取串口数据
func (bd *BlueDevice) readData() {
	defer func() {
		if r := recover(); r != nil {
			bd.logger.Errorf("BlueDevice", "[%s] 数据读取协程异常退出: %v", bd.config.DeviceID, r)
		}
	}()

	for {
		select {
		case <-bd.stopChan:
			bd.logger.Debugf("BlueDevice", "[%s] 数据读取协程收到停止信号", bd.config.DeviceID)
			return
		default:
			if bd.scanner.Scan() {
				data := bd.scanner.Text()
				bd.logger.Debugf("BlueDevice", "[%s] 接收数据: %s", bd.config.DeviceID, data)
				bd.parseData(data)
			} else {
				// 检查是否有错误
				if err := bd.scanner.Err(); err != nil {
					bd.logger.Errorf("BlueDevice", "[%s] 读取数据错误: %v", bd.config.DeviceID, err)
					return
				}
				// 短暂休眠避免CPU占用过高
				time.Sleep(10 * time.Millisecond)
			}
		}
	}
}

// parseData 解析接收到的数据
func (bd *BlueDevice) parseData(data string) {
	// 使用正则表达式匹配蓝牙设备信息
	// 格式示例: +OBSERVER:1,004C,12345678,ABCD,-45
	re := regexp.MustCompile(`\+OBSERVER:1,([0-9A-Fa-f]{4}),([0-9A-Fa-f]{8}),([0-9A-Fa-f]{4}),(-?\d+)`)
	matches := re.FindStringSubmatch(data)

	if len(matches) != 5 {
		return // 不是设备发现数据
	}

	manufacturerCode := strings.ToUpper(matches[1])
	deviceAddress := matches[2]
	rssiStr := matches[4]

	// 解析RSSI
	rssi, err := strconv.Atoi(rssiStr)
	if err != nil {
		bd.logger.Warnf("BlueDevice", "[%s] 无法解析RSSI值: %s", bd.config.DeviceID, rssiStr)
		return
	}

	// 获取厂商名称
	manufacturer, exists := manufacturerDict[manufacturerCode]
	if !exists {
		bd.logger.Debugf("BlueDevice", "[%s] 未知厂商代码: %s", bd.config.DeviceID, manufacturerCode)
		return // 只处理已知厂商的设备
	}

	// 生成设备唯一标识
	deviceKey := fmt.Sprintf("%s_%s_%d", manufacturerCode, deviceAddress, rssi)

	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	// 检查设备是否已被检测
	if bd.deleteDeviceList[deviceKey] {
		return // 设备已被检测，跳过
	}

	// 如果未开启上报，则不处理
	if !bd.enableReport {
		return
	}

	// 创建设备事件数据
	eventData := communication.DeviceEventData{
		MF:         manufacturer,
		DeviceID:   bd.config.DeviceID,
		SerialPath: bd.config.SerialPath,
		Timestamp:  time.Now().UnixMilli(),
	}

	// 发送设备事件
	select {
	case bd.deviceEvents <- eventData:
		bd.deleteDeviceList[deviceKey] = true
		bd.logger.Infof("BlueDevice", "[%s] 发现设备: %s (RSSI: %d)", bd.config.DeviceID, manufacturer, rssi)
	default:
		bd.logger.Warnf("BlueDevice", "[%s] 设备事件通道已满，丢弃事件", bd.config.DeviceID)
	}
}
