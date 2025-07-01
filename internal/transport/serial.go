// Package transport 串口传输层实现
package transport

import (
	"bufio"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"

	"bluetooth-device-go/internal/communication"
	"bluetooth-device-go/internal/config"
	"bluetooth-device-go/internal/logger"
)

// DataHandler 数据处理器类型
type DataHandler func(payload *communication.RequestPayload, callback ResponseCallback)

// ErrorHandler 错误处理器类型
type ErrorHandler func(err error, callback ResponseCallback)

// ResponseCallback 响应回调函数类型
type ResponseCallback func(response string)

// SerialTransport 串口传输层
type SerialTransport struct {
	config       config.SerialTransportConfig
	port         serial.Port
	scanner      *bufio.Scanner
	isConnected  bool
	dataHandler  DataHandler
	errorHandler ErrorHandler
	stopChan     chan struct{}
	mutex        sync.RWMutex
	logger       *logger.Logger
}

// NewSerialTransport 创建串口传输层
func NewSerialTransport(cfg config.SerialTransportConfig) *SerialTransport {
	return &SerialTransport{
		config:   cfg,
		stopChan: make(chan struct{}),
		logger:   logger.GetLogger(),
	}
}

// SetDataHandler 设置数据处理器
func (st *SerialTransport) SetDataHandler(handler DataHandler) {
	st.dataHandler = handler
}

// SetErrorHandler 设置错误处理器
func (st *SerialTransport) SetErrorHandler(handler ErrorHandler) {
	st.errorHandler = handler
}

// Start 启动传输层
func (st *SerialTransport) Start() error {
	st.logger.Infof("SerialTransport", "启动串口传输层: %s", st.config.SerialPath)

	if err := st.connect(); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	// 启动数据读取协程
	go st.readData()

	st.logger.Info("SerialTransport", "串口传输层启动成功")
	return nil
}

// Stop 停止传输层
func (st *SerialTransport) Stop() error {
	st.mutex.Lock()
	defer st.mutex.Unlock()

	st.logger.Info("SerialTransport", "正在停止串口传输层...")

	// 发送停止信号
	close(st.stopChan)

	// 关闭串口
	if st.port != nil {
		err := st.port.Close()
		st.port = nil
		st.isConnected = false

		if err != nil {
			st.logger.Errorf("SerialTransport", "关闭串口失败: %v", err)
			return err
		}
	}

	st.logger.Info("SerialTransport", "串口传输层已停止")
	return nil
}

// Send 发送数据
func (st *SerialTransport) Send(response communication.Response) error {
	st.mutex.RLock()
	defer st.mutex.RUnlock()

	if !st.isConnected || st.port == nil {
		return fmt.Errorf("serial port not connected")
	}

	// 将响应转换为JSON字符串
	jsonStr, err := response.ToJSON()
	if err != nil {
		return fmt.Errorf("failed to serialize response: %w", err)
	}

	// 添加换行符
	data := jsonStr + "\r\n"

	st.logger.Debugf("SerialTransport", "发送数据: %s", strings.TrimSpace(data))

	_, err = st.port.Write([]byte(data))
	if err != nil {
		st.logger.Errorf("SerialTransport", "发送数据失败: %v", err)
		return fmt.Errorf("failed to write to serial port: %w", err)
	}

	return nil
}

// IsConnected 检查是否已连接
func (st *SerialTransport) IsConnected() bool {
	st.mutex.RLock()
	defer st.mutex.RUnlock()
	return st.isConnected
}

// connect 建立串口连接
func (st *SerialTransport) connect() error {
	mode := &serial.Mode{
		BaudRate: st.config.BaudRate,
		DataBits: st.config.DataBits,
		StopBits: serial.StopBits(st.config.StopBits),
		Parity:   st.parseParity(st.config.Parity),
	}

	port, err := serial.Open(st.config.SerialPath, mode)
	if err != nil {
		return fmt.Errorf("failed to open serial port %s: %w", st.config.SerialPath, err)
	}

	st.port = port
	st.scanner = bufio.NewScanner(port)
	st.isConnected = true

	st.logger.Infof("SerialTransport", "串口连接成功: %s (波特率: %d)", st.config.SerialPath, st.config.BaudRate)
	return nil
}

// parseParity 解析校验位设置
func (st *SerialTransport) parseParity(parity string) serial.Parity {
	switch strings.ToLower(parity) {
	case "even":
		return serial.EvenParity
	case "odd":
		return serial.OddParity
	case "none":
		fallthrough
	default:
		return serial.NoParity
	}
}

// readData 读取串口数据
func (st *SerialTransport) readData() {
	defer func() {
		if r := recover(); r != nil {
			st.logger.Errorf("SerialTransport", "数据读取协程异常退出: %v", r)
		}
	}()

	for {
		select {
		case <-st.stopChan:
			st.logger.Debug("SerialTransport", "数据读取协程收到停止信号")
			return
		default:
			if st.scanner.Scan() {
				data := st.scanner.Text()
				st.logger.Debugf("SerialTransport", "接收数据: %s", data)
				st.handleReceivedData(data)
			} else {
				// 检查是否有错误
				if err := st.scanner.Err(); err != nil {
					st.logger.Errorf("SerialTransport", "读取数据错误: %v", err)
					if st.errorHandler != nil {
						st.errorHandler(err, st.createResponseCallback())
					}
					return
				}
				// 短暂休眠避免CPU占用过高
				time.Sleep(10 * time.Millisecond)
			}
		}
	}
}

// handleReceivedData 处理接收到的数据
func (st *SerialTransport) handleReceivedData(data string) {
	// 解析JSON消息
	payload, err := communication.ParseJSONMessage(data)
	if err != nil {
		st.logger.Warnf("SerialTransport", "解析消息失败: %v, 原始数据: %s", err, data)
		if st.errorHandler != nil {
			st.errorHandler(fmt.Errorf("invalid message format: %w", err), st.createResponseCallback())
		}
		return
	}

	// 调用数据处理器
	if st.dataHandler != nil {
		st.dataHandler(payload, st.createResponseCallback())
	} else {
		st.logger.Warn("SerialTransport", "数据处理器未设置，忽略消息")
	}
}

// createResponseCallback 创建响应回调
func (st *SerialTransport) createResponseCallback() ResponseCallback {
	return func(response string) {
		st.mutex.RLock()
		defer st.mutex.RUnlock()

		if !st.isConnected || st.port == nil {
			st.logger.Warn("SerialTransport", "串口未连接，无法发送响应")
			return
		}

		// 添加换行符
		data := response + "\r\n"

		st.logger.Debugf("SerialTransport", "发送响应: %s", strings.TrimSpace(data))

		_, err := st.port.Write([]byte(data))
		if err != nil {
			st.logger.Errorf("SerialTransport", "发送响应失败: %v", err)
		}
	}
}
