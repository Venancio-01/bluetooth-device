// Package heartbeat 心跳管理系统
package heartbeat

import (
	"sync"
	"time"

	"bluetooth-device-go/internal/communication"
	"bluetooth-device-go/internal/device"
	"bluetooth-device-go/internal/logger"
	"bluetooth-device-go/internal/transport"
)

// HeartbeatManager 心跳管理器
type HeartbeatManager struct {
	transport         *transport.SerialTransport
	deviceManager     *device.DeviceManager
	heartbeatTimer    *time.Timer
	heartbeatInterval time.Duration
	isRunning         bool
	mutex             sync.RWMutex
	logger            *logger.Logger
}

// NewHeartbeatManager 创建心跳管理器
func NewHeartbeatManager(transport *transport.SerialTransport, deviceManager *device.DeviceManager) *HeartbeatManager {
	return &HeartbeatManager{
		transport:         transport,
		deviceManager:     deviceManager,
		heartbeatInterval: 2 * time.Second, // 默认2秒间隔
		logger:            logger.GetLogger(),
	}
}

// SetInterval 设置心跳间隔
func (hm *HeartbeatManager) SetInterval(interval time.Duration) {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	hm.heartbeatInterval = interval
	hm.logger.Infof("HeartbeatManager", "心跳间隔已设置为: %v", interval)
}

// Start 启动心跳定时器
func (hm *HeartbeatManager) Start() {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	if hm.isRunning {
		hm.logger.Warn("HeartbeatManager", "心跳定时器已经在运行")
		return
	}

	hm.isRunning = true
	hm.scheduleNextHeartbeat()

	hm.logger.Infof("HeartbeatManager", "心跳定时器已启动，间隔: %v", hm.heartbeatInterval)
}

// Stop 停止心跳定时器
func (hm *HeartbeatManager) Stop() {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	if !hm.isRunning {
		return
	}

	if hm.heartbeatTimer != nil {
		hm.heartbeatTimer.Stop()
		hm.heartbeatTimer = nil
	}

	hm.isRunning = false
	hm.logger.Info("HeartbeatManager", "心跳定时器已停止")
}

// IsRunning 检查心跳定时器是否在运行
func (hm *HeartbeatManager) IsRunning() bool {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()
	return hm.isRunning
}

// scheduleNextHeartbeat 安排下一次心跳
func (hm *HeartbeatManager) scheduleNextHeartbeat() {
	if hm.heartbeatTimer != nil {
		hm.heartbeatTimer.Stop()
	}

	hm.heartbeatTimer = time.AfterFunc(hm.heartbeatInterval, func() {
		hm.sendHeartbeat()

		hm.mutex.Lock()
		if hm.isRunning {
			hm.scheduleNextHeartbeat()
		}
		hm.mutex.Unlock()
	})
}

// sendHeartbeat 发送心跳事件
func (hm *HeartbeatManager) sendHeartbeat() {
	defer func() {
		if r := recover(); r != nil {
			hm.logger.Errorf("HeartbeatManager", "发送心跳时发生异常: %v", r)
		}
	}()

	// 获取设备连接统计
	stats := hm.deviceManager.GetConnectionStats()

	// 创建心跳事件
	heartbeatEvent := communication.CreateHeartbeatEvent(stats.Connected > 0)

	// 发送心跳事件
	if err := hm.transport.Send(heartbeatEvent); err != nil {
		hm.logger.Errorf("HeartbeatManager", "发送心跳事件失败: %v", err)
	} else {
		hm.logger.Debugf("HeartbeatManager", "心跳事件已发送 (连接设备数: %d)", stats.Connected)
	}
}
