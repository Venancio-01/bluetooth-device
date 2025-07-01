// Package message 消息处理和命令分发
package message

import (
	"fmt"

	"bluetooth-device-go/internal/communication"
	"bluetooth-device-go/internal/config"
	"bluetooth-device-go/internal/device"
	"bluetooth-device-go/internal/logger"
)

// ResponseCallback 响应回调函数类型
type ResponseCallback func(response string)

// MessageHandler 消息处理器
type MessageHandler struct {
	deviceManager *device.DeviceManager
	config        *config.AppConfig
	logger        *logger.Logger
}

// NewMessageHandler 创建消息处理器
func NewMessageHandler(deviceManager *device.DeviceManager, cfg *config.AppConfig) *MessageHandler {
	return &MessageHandler{
		deviceManager: deviceManager,
		config:        cfg,
		logger:        logger.GetLogger(),
	}
}

// HandleMessage 处理来自传输层的消息
func (mh *MessageHandler) HandleMessage(payload *communication.RequestPayload, callback ResponseCallback) {
	if payload == nil {
		response := communication.CreateErrorResponse("Invalid message format")
		mh.sendResponse(response, callback)
		return
	}

	mh.logger.Debugf("MessageHandler", "处理命令: %d", payload.C)

	switch payload.C {
	case communication.CommandStart:
		mh.handleStartCommand(payload.D, callback)
	case communication.CommandStop:
		mh.handleStopCommand(callback)
	default:
		response := communication.CreateErrorResponse("Unknown command")
		mh.sendResponse(response, callback)
	}
}

// HandleError 处理错误
func (mh *MessageHandler) HandleError(err error, callback ResponseCallback) {
	mh.logger.Errorf("MessageHandler", "处理错误: %v", err)
	response := communication.CreateErrorResponse(err.Error())
	mh.sendResponse(response, callback)
}

// HandleDeviceEvent 处理设备事件
func (mh *MessageHandler) HandleDeviceEvent(eventData communication.DeviceEventData) communication.Response {
	return communication.CreateDeviceEvent(eventData)
}

// handleStartCommand 处理开始扫描命令
func (mh *MessageHandler) handleStartCommand(data map[string]interface{}, callback ResponseCallback) {
	// 解析请求数据
	requestData, err := communication.ParseRequestData(data)
	if err != nil {
		mh.logger.Errorf("MessageHandler", "解析开始扫描命令数据失败: %v", err)
		response := communication.CreateErrorResponse("Invalid request data")
		mh.sendResponse(response, callback)
		return
	}

	// 确定RSSI阈值
	rssi := requestData.RSSI
	if rssi == "" && mh.config.UseConfigRSSI {
		rssi = mh.config.RSSI
	}

	mh.logger.Infof("MessageHandler", "开始扫描，RSSI阈值: %s", rssi)

	// 开始扫描所有设备
	if err := mh.deviceManager.StartScan("", rssi); err != nil {
		mh.logger.Errorf("MessageHandler", "开始扫描失败: %v", err)
		response := communication.CreateErrorResponse(fmt.Sprintf("Failed to start scan: %v", err))
		mh.sendResponse(response, callback)
		return
	}

	// 开始上报所有设备
	mh.deviceManager.StartReport("")

	// 返回成功响应
	response := communication.CreateStatusResponse(true, "Scan started successfully")
	mh.sendResponse(response, callback)
}

// handleStopCommand 处理停止扫描命令
func (mh *MessageHandler) handleStopCommand(callback ResponseCallback) {
	mh.logger.Info("MessageHandler", "停止扫描")

	// 停止扫描所有设备
	if err := mh.deviceManager.StopScan(""); err != nil {
		mh.logger.Errorf("MessageHandler", "停止扫描失败: %v", err)
		response := communication.CreateErrorResponse(fmt.Sprintf("Failed to stop scan: %v", err))
		mh.sendResponse(response, callback)
		return
	}

	// 停止上报所有设备
	mh.deviceManager.StopReport("")

	// 返回成功响应
	response := communication.CreateStatusResponse(true, "Scan stopped successfully")
	mh.sendResponse(response, callback)
}

// sendResponse 发送响应
func (mh *MessageHandler) sendResponse(response communication.Response, callback ResponseCallback) {
	if callback == nil {
		mh.logger.Warn("MessageHandler", "响应回调为空，无法发送响应")
		return
	}

	jsonStr, err := response.ToJSON()
	if err != nil {
		mh.logger.Errorf("MessageHandler", "序列化响应失败: %v", err)
		// 发送错误响应
		errorResponse := communication.CreateErrorResponse("Failed to serialize response")
		if errorJsonStr, jsonErr := errorResponse.ToJSON(); jsonErr == nil {
			callback(errorJsonStr)
		}
		return
	}

	callback(jsonStr)
}
