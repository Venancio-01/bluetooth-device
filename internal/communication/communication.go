// Package communication 定义南北向通信的数据结构和协议
package communication

import (
	"encoding/json"
	"fmt"
)

// CommandCode 命令码 (上位机 -> 程序)
type CommandCode int

const (
	CommandStart CommandCode = 1 // 开始扫描
	CommandStop  CommandCode = 2 // 停止扫描
)

// EventTypeCode 事件/响应码 (程序 -> 上位机)
type EventTypeCode int

const (
	EventStatus    EventTypeCode = 1 // 状态响应
	EventError     EventTypeCode = 2 // 错误响应
	EventDevice    EventTypeCode = 3 // 设备事件
	EventHeartbeat EventTypeCode = 4 // 心跳事件
)

// RequestPayload 请求格式 (上位机 -> 程序)
type RequestPayload struct {
	C CommandCode            `json:"c"`           // 命令码
	D map[string]interface{} `json:"d,omitempty"` // 数据
}

// RequestData 请求数据格式
type RequestData struct {
	RSSI string `json:"rssi,omitempty"` // 信号强度阈值
}

// Response 响应/上报格式 (程序 -> 上位机)
type Response struct {
	T EventTypeCode          `json:"t"` // 事件类型码
	D map[string]interface{} `json:"d"` // 数据
}

// DeviceEventData 设备事件数据
type DeviceEventData struct {
	MF         string `json:"mf"`        // 厂商名称
	DeviceID   string `json:"did"`       // 设备ID
	SerialPath string `json:"sp"`        // 串口路径
	Timestamp  int64  `json:"timestamp"` // 时间戳
}

// StatusResponseData 状态响应数据
type StatusResponseData struct {
	Success bool   `json:"success"` // 是否成功
	Message string `json:"message"` // 消息
}

// ErrorResponseData 错误响应数据
type ErrorResponseData struct {
	Error string `json:"error"` // 错误信息
}

// HeartbeatEventData 心跳事件数据
type HeartbeatEventData struct {
	Run bool `json:"run"` // 是否运行中
}

// ParseRequestData 解析请求数据
func ParseRequestData(data map[string]interface{}) (*RequestData, error) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshal request data failed: %w", err)
	}

	var requestData RequestData
	if err := json.Unmarshal(jsonBytes, &requestData); err != nil {
		return nil, fmt.Errorf("unmarshal request data failed: %w", err)
	}

	return &requestData, nil
}

// CreateDeviceEvent 创建设备事件
func CreateDeviceEvent(deviceData DeviceEventData) Response {
	return Response{
		T: EventDevice,
		D: map[string]interface{}{
			"mf":        deviceData.MF,
			"did":       deviceData.DeviceID,
			"sp":        deviceData.SerialPath,
			"timestamp": deviceData.Timestamp,
		},
	}
}

// CreateStatusResponse 创建状态响应
func CreateStatusResponse(success bool, message string) Response {
	return Response{
		T: EventStatus,
		D: map[string]interface{}{
			"success": success,
			"message": message,
		},
	}
}

// CreateErrorResponse 创建错误响应
func CreateErrorResponse(errorMsg string) Response {
	return Response{
		T: EventError,
		D: map[string]interface{}{
			"error": errorMsg,
		},
	}
}

// CreateHeartbeatEvent 创建心跳事件
func CreateHeartbeatEvent(run bool) Response {
	return Response{
		T: EventHeartbeat,
		D: map[string]interface{}{
			"run": run,
		},
	}
}

// ToJSON 将响应转换为JSON字符串
func (r *Response) ToJSON() (string, error) {
	jsonBytes, err := json.Marshal(r)
	if err != nil {
		return "", fmt.Errorf("marshal response failed: %w", err)
	}
	return string(jsonBytes), nil
}

// ParseJSONMessage 解析JSON消息为请求载荷
func ParseJSONMessage(message string) (*RequestPayload, error) {
	var payload RequestPayload
	if err := json.Unmarshal([]byte(message), &payload); err != nil {
		return nil, fmt.Errorf("unmarshal message failed: %w", err)
	}
	return &payload, nil
}
