package communication

import (
	"encoding/json"
	"fmt"
)

// 命令码 (上位机 -> 设备)
type CommandCode int

const (
	START CommandCode = 1 // 启动扫描
	STOP  CommandCode = 2 // 停止扫描
)

// 事件/响应码 (设备 -> 上位机)
type EventTypeCode int

const (
	STATUS    EventTypeCode = 1 // 状态
	ERROR     EventTypeCode = 2 // 错误
	DEVICE    EventTypeCode = 3 // 扫描到设备
	HEARTBEAT EventTypeCode = 4 // 心跳
)

// 请求格式 (上位机 -> 设备)
type Request struct {
	Command CommandCode            `json:"c"`
	Data    map[string]interface{} `json:"d,omitempty"`
}

// 响应/上报格式 (设备 -> 上位机)
type Response struct {
	Type EventTypeCode          `json:"t"`
	Data map[string]interface{} `json:"d"`
}

// 创建状态响应
func CreateStatusResponse(data map[string]interface{}) string {
	response := Response{
		Type: STATUS,
		Data: data,
	}
	jsonData, _ := json.Marshal(response)
	return string(jsonData)
}

// 创建错误响应
func CreateErrorResponse(data map[string]interface{}) string {
	response := Response{
		Type: ERROR,
		Data: data,
	}
	jsonData, _ := json.Marshal(response)
	return string(jsonData)
}

// 创建设备事件
func CreateDeviceEvent(data map[string]interface{}) string {
	response := Response{
		Type: DEVICE,
		Data: data,
	}
	jsonData, _ := json.Marshal(response)
	return string(jsonData)
}

// 创建心跳事件
func CreateHeartbeatEvent(data map[string]interface{}) string {
	response := Response{
		Type: HEARTBEAT,
		Data: data,
	}
	jsonData, _ := json.Marshal(response)
	return string(jsonData)
}

// 解析JSON消息
func ParseJSONMessage(message string) (*Request, error) {
	var request Request
	err := json.Unmarshal([]byte(message), &request)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON message: %w", err)
	}
	return &request, nil
}
