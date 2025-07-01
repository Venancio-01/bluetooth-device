// Package config 配置管理系统
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// DeviceConfig 设备配置
type DeviceConfig struct {
	SerialPath string `json:"serialPath"`         // 串口路径
	DeviceID   string `json:"deviceId,omitempty"` // 设备ID
	BaudRate   int    `json:"baudRate,omitempty"` // 波特率
	Enabled    bool   `json:"enabled,omitempty"`  // 是否启用
}

// SerialTransportConfig 串口传输配置
type SerialTransportConfig struct {
	SerialPath string `json:"serialPath"`         // 串口路径
	BaudRate   int    `json:"baudRate,omitempty"` // 波特率
	DataBits   int    `json:"dataBits,omitempty"` // 数据位
	StopBits   int    `json:"stopBits,omitempty"` // 停止位
	Parity     string `json:"parity,omitempty"`   // 校验位
	Timeout    int    `json:"timeout,omitempty"`  // 超时时间（毫秒）
}

// LoggingConfig 日志配置
type LoggingConfig struct {
	Level              string `json:"level,omitempty"`              // 日志级别
	EnableDevicePrefix bool   `json:"enableDevicePrefix,omitempty"` // 启用设备前缀
	EnableTimestamp    bool   `json:"enableTimestamp,omitempty"`    // 启用时间戳
}

// AppConfig 应用程序配置
type AppConfig struct {
	Devices         []DeviceConfig        `json:"devices"`                   // 设备列表
	RSSI            string                `json:"rssi,omitempty"`            // 信号强度阈值
	UseConfigRSSI   bool                  `json:"useConfigRssi,omitempty"`   // 使用配置的RSSI
	ReportInterval  int                   `json:"reportInterval,omitempty"`  // 上报间隔（毫秒）
	SerialTransport SerialTransportConfig `json:"serialTransport,omitempty"` // 串口传输配置
	Logging         LoggingConfig         `json:"logging,omitempty"`         // 日志配置
}

// DefaultConfig 默认配置
var DefaultConfig = AppConfig{
	Devices: []DeviceConfig{
		{
			SerialPath: "/dev/ttyS3",
			DeviceID:   "device_0",
			BaudRate:   115200,
			Enabled:    true,
		},
	},
	RSSI:           "-50",
	UseConfigRSSI:  false,
	ReportInterval: 5000,
	SerialTransport: SerialTransportConfig{
		SerialPath: "/dev/ttyS1",
		BaudRate:   115200,
		DataBits:   8,
		StopBits:   1,
		Parity:     "none",
		Timeout:    5000,
	},
	Logging: LoggingConfig{
		Level:              "info",
		EnableDevicePrefix: true,
		EnableTimestamp:    true,
	},
}

// ConfigManager 配置管理器
type ConfigManager struct {
	configPath string
	config     AppConfig
}

// NewConfigManager 创建配置管理器
func NewConfigManager(configPath string) *ConfigManager {
	if configPath == "" {
		configPath = "config.json"
	}

	return &ConfigManager{
		configPath: configPath,
	}
}

// LoadConfig 加载配置
func (cm *ConfigManager) LoadConfig() (*AppConfig, error) {
	// 检查配置文件是否存在
	if _, err := os.Stat(cm.configPath); os.IsNotExist(err) {
		// 配置文件不存在，创建默认配置
		if err := cm.SaveConfig(&DefaultConfig); err != nil {
			return nil, fmt.Errorf("failed to create default config: %w", err)
		}
		cm.config = DefaultConfig
		return &cm.config, nil
	}

	// 读取配置文件
	data, err := os.ReadFile(cm.configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// 解析配置
	var config AppConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// 应用默认值
	cm.applyDefaults(&config)
	cm.config = config

	return &cm.config, nil
}

// SaveConfig 保存配置
func (cm *ConfigManager) SaveConfig(config *AppConfig) error {
	// 确保目录存在
	dir := filepath.Dir(cm.configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// 序列化配置
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// 写入文件
	if err := os.WriteFile(cm.configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// GetConfig 获取当前配置
func (cm *ConfigManager) GetConfig() *AppConfig {
	return &cm.config
}

// applyDefaults 应用默认值
func (cm *ConfigManager) applyDefaults(config *AppConfig) {
	if config.RSSI == "" {
		config.RSSI = DefaultConfig.RSSI
	}
	if config.ReportInterval == 0 {
		config.ReportInterval = DefaultConfig.ReportInterval
	}
	if config.SerialTransport.BaudRate == 0 {
		config.SerialTransport.BaudRate = DefaultConfig.SerialTransport.BaudRate
	}
	if config.SerialTransport.DataBits == 0 {
		config.SerialTransport.DataBits = DefaultConfig.SerialTransport.DataBits
	}
	if config.SerialTransport.StopBits == 0 {
		config.SerialTransport.StopBits = DefaultConfig.SerialTransport.StopBits
	}
	if config.SerialTransport.Parity == "" {
		config.SerialTransport.Parity = DefaultConfig.SerialTransport.Parity
	}
	if config.SerialTransport.Timeout == 0 {
		config.SerialTransport.Timeout = DefaultConfig.SerialTransport.Timeout
	}
	if config.Logging.Level == "" {
		config.Logging.Level = DefaultConfig.Logging.Level
	}

	// 为设备应用默认值
	for i := range config.Devices {
		if config.Devices[i].BaudRate == 0 {
			config.Devices[i].BaudRate = 115200
		}
		if config.Devices[i].DeviceID == "" {
			config.Devices[i].DeviceID = fmt.Sprintf("device_%d", i)
		}
	}
}
