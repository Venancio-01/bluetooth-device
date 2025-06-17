package bluetooth

import (
	"bufio"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"
	"hjrich.com/bluetooth-device/internal/communication"
)

// 厂商字典 - 根据源项目的MANUFACTURER_DICT
var ManufacturerDict = map[string]string{
	"0001": "Nokia Mobile Phones",
	"0008": "Motorola",
	"004C": "Apple, Inc.",
	"0056": "Sony Ericsson Mobile Communications",
	"0075": "Samsung Electronics Co. Ltd.",
	"00C4": "LG Electronics",
	"00EO": "Google",
}

// InitializeState 初始化状态
type InitializeState string

const (
	Uninitialized InitializeState = "uninitialized"
	Initializing  InitializeState = "initializing"
	Initialized   InitializeState = "initialized"
)

// BlueDevice 蓝牙设备结构体
type BlueDevice struct {
	port            serial.Port
	initializeState InitializeState
	isScanning      bool
	deviceEvents    chan string     // 用于上报设备事件
	detectedDevices map[string]bool // 用于去重已检测到的设备
	mutex           sync.Mutex      // 用于保护共享状态
	heartbeatTicker *time.Ticker    // 心跳定时器
	heartbeatStop   chan bool       // 心跳停止信号
	mockMode        bool            // 模拟模式，用于测试
}

// NewBlueDevice 创建新的蓝牙设备实例
func NewBlueDevice() *BlueDevice {
	return &BlueDevice{
		initializeState: Uninitialized,
		isScanning:      false,
		deviceEvents:    make(chan string, 10),
		detectedDevices: make(map[string]bool),
		heartbeatStop:   make(chan bool, 1), // 使用带缓冲的通道
		mockMode:        false,
	}
}

// NewBlueDeviceMock 创建模拟模式的蓝牙设备实例（用于测试）
func NewBlueDeviceMock() *BlueDevice {
	return &BlueDevice{
		initializeState: Initialized, // 模拟模式下直接设为已初始化
		isScanning:      false,
		deviceEvents:    make(chan string, 10),
		detectedDevices: make(map[string]bool),
		heartbeatStop:   make(chan bool, 1), // 使用带缓冲的通道
		mockMode:        true,
	}
}

// Connect 连接串口
func (bd *BlueDevice) Connect() error {
	if bd.mockMode {
		log.Println("模拟模式：跳过串口连接")
		return nil
	}

	mode := &serial.Mode{
		BaudRate: 115200,
		Parity:   serial.NoParity,
		DataBits: 8,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open("/dev/ttyUSB0", mode)
	if err != nil {
		return fmt.Errorf("failed to open serial port: %w", err)
	}

	bd.port = port
	log.Println("串口连接成功")

	// 启动数据读取goroutine
	go bd.readData()

	return nil
}

// Disconnect 断开串口连接
func (bd *BlueDevice) Disconnect() error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	if err := bd.stopScanInternal(); err != nil {
		log.Printf("停止扫描时出错: %v", err)
	}

	// 停止心跳机制
	bd.stopHeartbeat()

	if bd.port != nil {
		err := bd.port.Close()
		bd.port = nil
		return err
	}
	return nil
}

// Send 发送数据到串口
func (bd *BlueDevice) Send(data string) error {
	if bd.mockMode {
		log.Printf("模拟模式：发送数据: %s", strings.TrimSpace(data))
		return nil
	}

	if bd.port == nil {
		return fmt.Errorf("serial port not connected")
	}

	log.Printf("发送数据: %s", strings.TrimSpace(data))
	_, err := bd.port.Write([]byte(data))
	if err != nil {
		return fmt.Errorf("failed to write to serial port: %w", err)
	}
	return nil
}

// readData 读取串口数据的goroutine
func (bd *BlueDevice) readData() {
	if bd.port == nil {
		return
	}

	scanner := bufio.NewScanner(bd.port)
	for scanner.Scan() {
		data := scanner.Text()
		log.Printf("接收数据: %s", data)
		bd.parseData(data)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("读取串口数据时出错: %v", err)
	}
}

// parseData 解析接收到的数据
func (bd *BlueDevice) parseData(data string) {
	// 根据源项目的解析逻辑：data.split(',')?.[2]?.split(':')?.[1]
	parts := strings.Split(data, ",")
	if len(parts) < 3 {
		return
	}

	advParts := strings.Split(parts[2], ":")
	if len(advParts) < 2 {
		return
	}

	advStr := advParts[1]
	if advStr == "" {
		return
	}

	// 查找FF标识符
	ffIndex := strings.Index(advStr, "FF")
	if ffIndex == -1 {
		return
	}

	// 提取厂商ID
	if ffIndex+6 <= len(advStr) {
		if ffIndex+6 <= len(advStr) {
			part1 := advStr[ffIndex+4 : ffIndex+6]
			part2 := advStr[ffIndex+2 : ffIndex+4]
			targetStr := part1 + part2

			if manufacturer, exists := ManufacturerDict[strings.ToUpper(targetStr)]; exists {
				bd.mutex.Lock()
				hasDevice := bd.detectedDevices[targetStr]
				if !hasDevice {
					bd.detectedDevices[targetStr] = true
					bd.mutex.Unlock()

					log.Printf("发现设备厂商: %s", manufacturer)
					// 发送设备事件
					deviceData := map[string]interface{}{
						"mf": manufacturer,
					}
					eventStr := communication.CreateDeviceEvent(deviceData)
					select {
					case bd.deviceEvents <- eventStr:
					default:
						log.Println("设备事件通道已满，丢弃事件")
					}
				} else {
					bd.mutex.Unlock()
				}
			}
		}
	}
}

// sendAndSleep 发送数据并等待
func (bd *BlueDevice) sendAndSleep(data string, sleepTime time.Duration) error {
	if err := bd.Send(data); err != nil {
		return err
	}
	if sleepTime > 0 {
		time.Sleep(sleepTime)
	}
	return nil
}

// Initialize 初始化蓝牙设备
func (bd *BlueDevice) Initialize() error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	if bd.initializeState == Initializing || bd.initializeState == Initialized {
		return nil
	}

	bd.initializeState = Initializing
	log.Println("开始初始化蓝牙设备")

	// 根据源项目的初始化流程
	// 重启设备
	if err := bd.sendAndSleep(BuildRestartCommand(), 1*time.Second); err != nil {
		return fmt.Errorf("重启设备失败: %w", err)
	}

	// 进入AT命令模式
	if err := bd.sendAndSleep(BuildEnterCommandMode(), 1*time.Second); err != nil {
		return fmt.Errorf("进入AT命令模式失败: %w", err)
	}

	// 设置设备为单主角色
	if err := bd.sendAndSleep(BuildSetRoleCommand(), 1*time.Second); err != nil {
		return fmt.Errorf("设置设备角色失败: %w", err)
	}

	// 重启设备
	if err := bd.sendAndSleep(BuildRestartCommand(), 3*time.Second); err != nil {
		return fmt.Errorf("重启设备失败: %w", err)
	}

	// 进入AT命令模式
	if err := bd.sendAndSleep(BuildEnterCommandMode(), 2*time.Second); err != nil {
		return fmt.Errorf("进入AT命令模式失败: %w", err)
	}

	bd.initializeState = Initialized
	log.Println("蓝牙设备初始化完成")

	// 启动心跳机制（不加锁版本，因为Initialize已经持有锁）
	bd.startHeartbeatInternal()

	return nil
}

// StartScan 开始扫描
func (bd *BlueDevice) StartScan(rssi string) error {
	// 首先检查是否需要初始化，避免在持有锁时调用Initialize
	bd.mutex.Lock()
	needInit := bd.initializeState == Uninitialized
	isInitializing := bd.initializeState == Initializing
	bd.mutex.Unlock()

	if needInit {
		if err := bd.Initialize(); err != nil {
			return fmt.Errorf("初始化设备失败: %w", err)
		}
	} else if isInitializing {
		return fmt.Errorf("设备初始化中，请稍后再试")
	}

	// 现在安全地获取锁进行扫描操作
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	// 清空已检测设备列表
	bd.detectedDevices = make(map[string]bool)
	bd.isScanning = true

	log.Printf("开始扫描，RSSI阈值: %s", rssi)

	if bd.mockMode {
		log.Println("模拟模式：扫描已启动")
		return nil
	}

	// 设置设备为观察者模式
	if err := bd.sendAndSleep(BuildObserverCommand(rssi), 0); err != nil {
		bd.isScanning = false
		return fmt.Errorf("启动扫描失败: %w", err)
	}

	return nil
}

// StopScan 停止扫描
func (bd *BlueDevice) StopScan() error {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()
	return bd.stopScanInternal()
}

// stopScanInternal 内部停止扫描方法（不加锁）
func (bd *BlueDevice) stopScanInternal() error {
	if !bd.isScanning {
		return nil
	}

	log.Println("停止扫描")

	if bd.mockMode {
		log.Println("模拟模式：扫描已停止")
		bd.isScanning = false
		return nil
	}

	// 停止扫描
	if err := bd.sendAndSleep(BuildStopObserverCommand(), 0); err != nil {
		return fmt.Errorf("停止扫描失败: %w", err)
	}

	bd.isScanning = false
	return nil
}

// GetDeviceEventsChannel 获取设备事件通道
func (bd *BlueDevice) GetDeviceEventsChannel() <-chan string {
	return bd.deviceEvents
}

// IsScanning 检查是否正在扫描
func (bd *BlueDevice) IsScanning() bool {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()
	return bd.isScanning
}

// GetInitializeState 获取初始化状态
func (bd *BlueDevice) GetInitializeState() InitializeState {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()
	return bd.initializeState
}

// startHeartbeatInternal 启动心跳机制（内部方法，不加锁）
func (bd *BlueDevice) startHeartbeatInternal() {
	if bd.heartbeatTicker != nil {
		return // 心跳已经启动
	}

	bd.heartbeatTicker = time.NewTicker(2 * time.Second)

	go func() {
		for {
			select {
			case <-bd.heartbeatTicker.C:
				// 发送心跳事件，使用缩写键名
				heartbeatEvent := communication.CreateHeartbeatEvent(map[string]interface{}{
					"run": true, // run 已经是缩写形式
				})
				select {
				case bd.deviceEvents <- heartbeatEvent:
					log.Println("发送心跳事件")
				default:
					// 如果通道满了，跳过这次心跳
					log.Println("心跳事件通道满，跳过此次心跳")
				}
			case <-bd.heartbeatStop:
				return
			}
		}
	}()
}

// stopHeartbeat 停止心跳机制
func (bd *BlueDevice) stopHeartbeat() {
	bd.mutex.Lock()
	defer bd.mutex.Unlock()

	if bd.heartbeatTicker != nil {
		bd.heartbeatTicker.Stop()
		bd.heartbeatTicker = nil

		// 非阻塞发送停止信号
		select {
		case bd.heartbeatStop <- true:
		default:
			// 如果通道满了或没有接收者，直接跳过
		}
	}
}
