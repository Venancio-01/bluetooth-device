package transport

import "hjrich.com/bluetooth-device/internal/communication"

// ResponseCallback 响应回调函数类型
type ResponseCallback func(response string)

// ITransport 传输层接口
type ITransport interface {
	Start() error
	Stop() error
	Send(data string) error
	ReceiveChannel() <-chan RequestWithCallback // 用于接收指令的只读 Channel
}

// RequestWithCallback 包含请求和回调的结构体
type RequestWithCallback struct {
	Request  *communication.Request
	Callback ResponseCallback
}
