// Package device 设备管理器
package device

import (
	"fmt"
	"sync"
	"time"

	"bluetooth-device-go/internal/bluetooth"
	"bluetooth-device-go/internal/communication"
	"bluetooth-device-go/internal/config"
	"bluetooth-device-go/internal/logger"
)

// DeviceInfo 设备信息
type DeviceInfo struct {
	DeviceID    string `json:"deviceId"`
	SerialPath  string `json:"serialPath"`
	Connected   bool   `json:"connected"`
	Initialized bool   `json:"initialized"`
	Scanning    bool   `json:"scanning"`
}

// ConnectionStats 连接统计
type ConnectionStats struct {
	Total        int `json:"total"`
	Connected    int `json:"connected"`
	Reconnecting int `json:"reconnecting"`
}

// DeviceEventHandler 设备事件处理器
type DeviceEventHandler func(eventData communication.DeviceEventData)

// DeviceManager 设备管理器
type DeviceManager struct {
	config          *config.AppConfig
	devices         map[string]*bluetooth.BlueDevice
	reconnectTimers map[string]*time.Timer
	deviceEvents    chan communication.DeviceEventData
	eventHandler    DeviceEventHandler
	mutex           sync.RWMutex
	stopChan        chan struct{}
	logger          *logger.Logger
}

// NewDeviceManager 创建设备管理器
func NewDeviceManager(cfg *config.AppConfig) *DeviceManager {
	return &DeviceManager{
		config:          cfg,
		devices:         make(map[string]*bluetooth.BlueDevice),
		reconnectTimers: make(map[string]*time.Timer),
		deviceEvents:    make(chan communication.DeviceEventData, 1000),
		stopChan:        make(chan struct{}),
		logger:          logger.GetLogger(),
	}
}

// SetEventHandler 设置事件处理器
func (dm *DeviceManager) SetEventHandler(handler DeviceEventHandler) {
	dm.eventHandler = handler
}

// InitializeDevices 初始化所有设备
func (dm *DeviceManager) InitializeDevices() error {
	dm.logger.Info("DeviceManager", "开始初始化设备...")

	var wg sync.WaitGroup
	errors := make(chan error, len(dm.config.Devices))

	for _, deviceConfig := range dm.config.Devices {
		if !deviceConfig.Enabled {
			dm.logger.Infof("DeviceManager", "跳过已禁用的设备: %s", deviceConfig.SerialPath)
			continue
		}

		wg.Add(1)
		go func(cfg config.DeviceConfig) {
			defer wg.Done()
			if err := dm.initializeDevice(cfg); err != nil {
				errors <- fmt.Errorf("failed to initialize device %s: %w", cfg.SerialPath, err)
			}
		}(deviceConfig)
	}

	wg.Wait()
	close(errors)

	// 收集错误
	var initErrors []error
	for err := range errors {
		initErrors = append(initErrors, err)
		dm.logger.Error("DeviceManager", err.Error())
	}

	// 启动事件处理协程
	go dm.handleDeviceEvents()

	stats := dm.GetConnectionStats()
	dm.logger.Infof("DeviceManager", "设备初始化完成: %d/%d 个设备连接成功", stats.Connected, stats.Total)

	if stats.Connected == 0 && len(initErrors) > 0 {
		return fmt.Errorf("no devices connected successfully")
	}

	return nil
}

// initializeDevice 初始化单个设备
func (dm *DeviceManager) initializeDevice(cfg config.DeviceConfig) error {
	deviceConfig := bluetooth.BlueDeviceConfig{
		SerialPath:     cfg.SerialPath,
		DeviceID:       cfg.DeviceID,
		ReportInterval: dm.config.ReportInterval,
		RSSI:           dm.config.RSSI,
	}

	device := bluetooth.NewBlueDevice(deviceConfig)
	deviceID := device.GetDeviceID()

	// 连接设备
	if err := device.Connect(); err != nil {
		dm.logger.Errorf("DeviceManager", "[%s] 连接失败: %v", deviceID, err)
		// 启动重连
		dm.scheduleReconnect(cfg, deviceID)
		return err
	}

	// 初始化设备
	if err := device.Initialize(); err != nil {
		dm.logger.Errorf("DeviceManager", "[%s] 初始化失败: %v", deviceID, err)
		device.Disconnect()
		// 启动重连
		dm.scheduleReconnect(cfg, deviceID)
		return err
	}

	// 启动上报
	device.StartReport()

	dm.mutex.Lock()
	dm.devices[deviceID] = device
	dm.mutex.Unlock()

	dm.logger.Infof("DeviceManager", "[%s] 设备初始化成功", deviceID)

	// 启动设备事件监听
	go dm.listenDeviceEvents(device)

	return nil
}

// scheduleReconnect 安排重连
func (dm *DeviceManager) scheduleReconnect(cfg config.DeviceConfig, deviceID string) {
	dm.mutex.Lock()
	defer dm.mutex.Unlock()

	// 取消之前的重连定时器
	if timer, exists := dm.reconnectTimers[deviceID]; exists {
		timer.Stop()
	}

	// 设置新的重连定时器（5秒后重连）
	timer := time.AfterFunc(5*time.Second, func() {
		dm.logger.Infof("DeviceManager", "[%s] 尝试重连...", deviceID)
		if err := dm.initializeDevice(cfg); err != nil {
			dm.logger.Errorf("DeviceManager", "[%s] 重连失败: %v", deviceID, err)
			// 继续安排下次重连
			dm.scheduleReconnect(cfg, deviceID)
		} else {
			// 重连成功，清理重连定时器
			dm.mutex.Lock()
			delete(dm.reconnectTimers, deviceID)
			dm.mutex.Unlock()
		}
	})

	dm.reconnectTimers[deviceID] = timer
}

// listenDeviceEvents 监听设备事件
func (dm *DeviceManager) listenDeviceEvents(device *bluetooth.BlueDevice) {
	deviceID := device.GetDeviceID()

	for {
		select {
		case <-dm.stopChan:
			dm.logger.Debugf("DeviceManager", "[%s] 设备事件监听协程收到停止信号", deviceID)
			return
		case eventData := <-device.GetDeviceEvents():
			// 转发事件到管理器的事件通道
			select {
			case dm.deviceEvents <- eventData:
			default:
				dm.logger.Warnf("DeviceManager", "[%s] 设备事件通道已满，丢弃事件", deviceID)
			}
		}
	}
}

// handleDeviceEvents 处理设备事件
func (dm *DeviceManager) handleDeviceEvents() {
	for {
		select {
		case <-dm.stopChan:
			dm.logger.Debug("DeviceManager", "设备事件处理协程收到停止信号")
			return
		case eventData := <-dm.deviceEvents:
			if dm.eventHandler != nil {
				dm.eventHandler(eventData)
			}
		}
	}
}

// GetDevice 获取指定设备
func (dm *DeviceManager) GetDevice(deviceID string) *bluetooth.BlueDevice {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	return dm.devices[deviceID]
}

// GetAllDevices 获取所有设备
func (dm *DeviceManager) GetAllDevices() []*bluetooth.BlueDevice {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	devices := make([]*bluetooth.BlueDevice, 0, len(dm.devices))
	for _, device := range dm.devices {
		devices = append(devices, device)
	}

	return devices
}

// GetDevicesInfo 获取所有设备信息
func (dm *DeviceManager) GetDevicesInfo() []DeviceInfo {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	infos := make([]DeviceInfo, 0, len(dm.devices))
	for _, device := range dm.devices {
		status := device.GetStatus()
		infos = append(infos, DeviceInfo{
			DeviceID:    device.GetDeviceID(),
			SerialPath:  device.GetSerialPath(),
			Connected:   status.Connected,
			Initialized: status.InitializeState == bluetooth.StateInitialized,
			Scanning:    status.IsScanning,
		})
	}

	return infos
}

// GetConnectionStats 获取连接统计
func (dm *DeviceManager) GetConnectionStats() ConnectionStats {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	stats := ConnectionStats{
		Total:        len(dm.config.Devices),
		Connected:    len(dm.devices),
		Reconnecting: len(dm.reconnectTimers),
	}

	return stats
}

// StartScan 开始扫描（所有设备或指定设备）
func (dm *DeviceManager) StartScan(deviceID string, rssi string) error {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	if deviceID != "" {
		// 指定设备
		device, exists := dm.devices[deviceID]
		if !exists {
			return fmt.Errorf("device %s not found", deviceID)
		}
		return device.StartScan(rssi)
	}

	// 所有设备
	var errors []error
	for _, device := range dm.devices {
		if err := device.StartScan(rssi); err != nil {
			errors = append(errors, fmt.Errorf("device %s: %w", device.GetDeviceID(), err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("some devices failed to start scan: %v", errors)
	}

	return nil
}

// StopScan 停止扫描（所有设备或指定设备）
func (dm *DeviceManager) StopScan(deviceID string) error {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	if deviceID != "" {
		// 指定设备
		device, exists := dm.devices[deviceID]
		if !exists {
			return fmt.Errorf("device %s not found", deviceID)
		}
		return device.StopScan()
	}

	// 所有设备
	var errors []error
	for _, device := range dm.devices {
		if err := device.StopScan(); err != nil {
			errors = append(errors, fmt.Errorf("device %s: %w", device.GetDeviceID(), err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("some devices failed to stop scan: %v", errors)
	}

	return nil
}

// StartReport 开始上报（所有设备或指定设备）
func (dm *DeviceManager) StartReport(deviceID string) {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	if deviceID != "" {
		// 指定设备
		if device, exists := dm.devices[deviceID]; exists {
			device.StartReport()
		}
		return
	}

	// 所有设备
	for _, device := range dm.devices {
		device.StartReport()
	}
}

// StopReport 停止上报（所有设备或指定设备）
func (dm *DeviceManager) StopReport(deviceID string) {
	dm.mutex.RLock()
	defer dm.mutex.RUnlock()

	if deviceID != "" {
		// 指定设备
		if device, exists := dm.devices[deviceID]; exists {
			device.StopReport()
		}
		return
	}

	// 所有设备
	for _, device := range dm.devices {
		device.StopReport()
	}
}

// DisconnectAll 断开所有设备连接
func (dm *DeviceManager) DisconnectAll() error {
	dm.mutex.Lock()
	defer dm.mutex.Unlock()

	dm.logger.Info("DeviceManager", "正在断开所有设备连接...")

	// 停止事件处理
	close(dm.stopChan)

	// 停止所有重连定时器
	for deviceID, timer := range dm.reconnectTimers {
		timer.Stop()
		dm.logger.Debugf("DeviceManager", "[%s] 停止重连定时器", deviceID)
	}
	dm.reconnectTimers = make(map[string]*time.Timer)

	// 断开所有设备
	var errors []error
	for deviceID, device := range dm.devices {
		if err := device.Disconnect(); err != nil {
			errors = append(errors, fmt.Errorf("device %s: %w", deviceID, err))
		} else {
			dm.logger.Infof("DeviceManager", "[%s] 设备已断开连接", deviceID)
		}
	}

	dm.devices = make(map[string]*bluetooth.BlueDevice)

	if len(errors) > 0 {
		return fmt.Errorf("some devices failed to disconnect: %v", errors)
	}

	dm.logger.Info("DeviceManager", "所有设备已断开连接")
	return nil
}
