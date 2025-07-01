// Package app 应用程序主控制器
package app

import (
	"fmt"
	"sync"

	"bluetooth-device-go/internal/communication"
	"bluetooth-device-go/internal/config"
	"bluetooth-device-go/internal/device"
	"bluetooth-device-go/internal/heartbeat"
	"bluetooth-device-go/internal/logger"
	"bluetooth-device-go/internal/message"
	"bluetooth-device-go/internal/transport"
)

// AppController 应用程序主控制器
type AppController struct {
	configManager    *config.ConfigManager
	deviceManager    *device.DeviceManager
	transport        *transport.SerialTransport
	messageHandler   *message.MessageHandler
	heartbeatManager *heartbeat.HeartbeatManager
	isInitialized    bool
	mutex            sync.RWMutex
	logger           *logger.Logger
}

// NewAppController 创建应用程序控制器
func NewAppController(configPath string) *AppController {
	return &AppController{
		configManager: config.NewConfigManager(configPath),
		logger:        logger.GetLogger(),
	}
}

// Initialize 初始化应用程序
func (ac *AppController) Initialize() error {
	ac.mutex.Lock()
	defer ac.mutex.Unlock()

	if ac.isInitialized {
		ac.logger.Warn("AppController", "应用程序已经初始化")
		return nil
	}

	ac.logger.Info("AppController", "正在启动蓝牙设备检测系统...")

	// 1. 加载配置
	if err := ac.loadConfiguration(); err != nil {
		return fmt.Errorf("failed to load configuration: %w", err)
	}

	// 2. 初始化日志系统
	ac.initializeLogger()

	// 3. 验证配置
	if err := ac.validateConfiguration(); err != nil {
		return fmt.Errorf("configuration validation failed: %w", err)
	}

	// 4. 初始化设备管理器
	if err := ac.initializeDeviceManager(); err != nil {
		return fmt.Errorf("failed to initialize device manager: %w", err)
	}

	// 5. 初始化传输层
	if err := ac.initializeTransport(); err != nil {
		return fmt.Errorf("failed to initialize transport: %w", err)
	}

	// 6. 初始化消息处理器
	ac.initializeMessageHandler()

	// 7. 初始化心跳管理器
	ac.initializeHeartbeatManager()

	// 8. 设置事件监听器
	ac.setupEventListeners()

	// 9. 启动传输层
	if err := ac.startTransport(); err != nil {
		return fmt.Errorf("failed to start transport: %w", err)
	}

	// 10. 初始化设备
	if err := ac.initializeDevices(); err != nil {
		return fmt.Errorf("failed to initialize devices: %w", err)
	}

	// 11. 启动心跳
	ac.startHeartbeat()

	ac.isInitialized = true
	ac.logger.Info("AppController", "蓝牙设备检测系统启动成功")

	return nil
}

// Shutdown 关闭应用程序
func (ac *AppController) Shutdown() error {
	ac.mutex.Lock()
	defer ac.mutex.Unlock()

	if !ac.isInitialized {
		return nil
	}

	ac.logger.Info("AppController", "正在关闭应用程序...")

	var errors []error

	// 停止心跳
	if ac.heartbeatManager != nil {
		ac.heartbeatManager.Stop()
	}

	// 断开所有设备
	if ac.deviceManager != nil {
		if err := ac.deviceManager.DisconnectAll(); err != nil {
			errors = append(errors, fmt.Errorf("failed to disconnect devices: %w", err))
		}
	}

	// 停止传输层
	if ac.transport != nil {
		if err := ac.transport.Stop(); err != nil {
			errors = append(errors, fmt.Errorf("failed to stop transport: %w", err))
		}
	}

	ac.isInitialized = false

	if len(errors) > 0 {
		ac.logger.Errorf("AppController", "关闭应用程序时发生错误: %v", errors)
		return fmt.Errorf("shutdown errors: %v", errors)
	}

	ac.logger.Info("AppController", "应用程序已安全关闭")
	return nil
}

// GetDeviceManager 获取设备管理器
func (ac *AppController) GetDeviceManager() *device.DeviceManager {
	ac.mutex.RLock()
	defer ac.mutex.RUnlock()
	return ac.deviceManager
}

// GetTransport 获取传输层
func (ac *AppController) GetTransport() *transport.SerialTransport {
	ac.mutex.RLock()
	defer ac.mutex.RUnlock()
	return ac.transport
}

// IsInitialized 检查是否已初始化
func (ac *AppController) IsInitialized() bool {
	ac.mutex.RLock()
	defer ac.mutex.RUnlock()
	return ac.isInitialized
}

// loadConfiguration 加载配置
func (ac *AppController) loadConfiguration() error {
	_, err := ac.configManager.LoadConfig()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	ac.logger.Info("AppController", "配置加载成功")
	return nil
}

// initializeLogger 初始化日志系统
func (ac *AppController) initializeLogger() {
	cfg := ac.configManager.GetConfig()

	loggerConfig := logger.LoggerConfig{
		Level:              logger.ParseLogLevel(cfg.Logging.Level),
		EnableDevicePrefix: cfg.Logging.EnableDevicePrefix,
		EnableTimestamp:    cfg.Logging.EnableTimestamp,
	}

	logger.InitGlobalLogger(loggerConfig)
	ac.logger = logger.GetLogger()

	ac.logger.Infof("AppController", "日志系统初始化完成，级别: %s", cfg.Logging.Level)
}

// validateConfiguration 验证配置
func (ac *AppController) validateConfiguration() error {
	cfg := ac.configManager.GetConfig()

	if len(cfg.Devices) == 0 {
		return fmt.Errorf("no devices configured")
	}

	enabledCount := 0
	for _, device := range cfg.Devices {
		if device.Enabled {
			enabledCount++
		}
		if device.SerialPath == "" {
			return fmt.Errorf("device serial path cannot be empty")
		}
	}

	if enabledCount == 0 {
		return fmt.Errorf("no enabled devices found")
	}

	if cfg.SerialTransport.SerialPath == "" {
		return fmt.Errorf("serial transport path cannot be empty")
	}

	ac.logger.Infof("AppController", "配置验证通过，启用设备数: %d", enabledCount)
	return nil
}

// initializeDeviceManager 初始化设备管理器
func (ac *AppController) initializeDeviceManager() error {
	cfg := ac.configManager.GetConfig()
	ac.deviceManager = device.NewDeviceManager(cfg)

	ac.logger.Info("AppController", "设备管理器初始化完成")
	return nil
}

// initializeTransport 初始化传输层
func (ac *AppController) initializeTransport() error {
	cfg := ac.configManager.GetConfig()
	ac.transport = transport.NewSerialTransport(cfg.SerialTransport)

	ac.logger.Info("AppController", "传输层初始化完成")
	return nil
}

// initializeMessageHandler 初始化消息处理器
func (ac *AppController) initializeMessageHandler() {
	cfg := ac.configManager.GetConfig()
	ac.messageHandler = message.NewMessageHandler(ac.deviceManager, cfg)

	ac.logger.Info("AppController", "消息处理器初始化完成")
}

// initializeHeartbeatManager 初始化心跳管理器
func (ac *AppController) initializeHeartbeatManager() {
	ac.heartbeatManager = heartbeat.NewHeartbeatManager(ac.transport, ac.deviceManager)

	ac.logger.Info("AppController", "心跳管理器初始化完成")
}

// setupEventListeners 设置事件监听器
func (ac *AppController) setupEventListeners() {
	// 设置传输层的数据处理器
	ac.transport.SetDataHandler(func(payload *communication.RequestPayload, callback transport.ResponseCallback) {
		ac.messageHandler.HandleMessage(payload, message.ResponseCallback(callback))
	})

	// 设置传输层的错误处理器
	ac.transport.SetErrorHandler(func(err error, callback transport.ResponseCallback) {
		ac.messageHandler.HandleError(err, message.ResponseCallback(callback))
	})

	// 设置设备管理器的事件处理器
	ac.deviceManager.SetEventHandler(func(eventData communication.DeviceEventData) {
		// 处理设备事件并通过传输层发送
		event := ac.messageHandler.HandleDeviceEvent(eventData)
		if err := ac.transport.Send(event); err != nil {
			ac.logger.Errorf("AppController", "发送设备事件失败: %v", err)
		}
	})

	ac.logger.Info("AppController", "事件监听器设置完成")
}

// startTransport 启动传输层
func (ac *AppController) startTransport() error {
	if err := ac.transport.Start(); err != nil {
		return fmt.Errorf("failed to start transport: %w", err)
	}

	ac.logger.Info("AppController", "传输层启动成功")
	return nil
}

// initializeDevices 初始化设备
func (ac *AppController) initializeDevices() error {
	if err := ac.deviceManager.InitializeDevices(); err != nil {
		return fmt.Errorf("failed to initialize devices: %w", err)
	}

	stats := ac.deviceManager.GetConnectionStats()
	ac.logger.Infof("AppController", "设备初始化完成: %d/%d 个设备连接成功", stats.Connected, stats.Total)

	if stats.Reconnecting > 0 {
		ac.logger.Infof("AppController", "%d 个设备正在重连中", stats.Reconnecting)
	}

	if stats.Connected == 0 && stats.Reconnecting == 0 {
		return fmt.Errorf("no devices connected successfully")
	}

	return nil
}

// startHeartbeat 启动心跳
func (ac *AppController) startHeartbeat() {
	ac.heartbeatManager.Start()
	ac.logger.Info("AppController", "心跳定时器已启动")
}
