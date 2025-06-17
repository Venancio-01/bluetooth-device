package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"hjrich.com/bluetooth-device/internal/bluetooth"
	"hjrich.com/bluetooth-device/internal/communication"
	"hjrich.com/bluetooth-device/internal/transport"
)

// handleMessage 处理来自传输层的消息
func handleMessage(blueDevice *bluetooth.BlueDevice, req *communication.Request) string {
	if req == nil {
		return communication.CreateErrorResponse(map[string]interface{}{
			"msg": "Invalid message format",
		})
	}

	switch req.Command {
	case communication.START:
		rssi := "-50" // 默认值
		if req.Data != nil {
			if rssiVal, ok := req.Data["rssi"].(string); ok && rssiVal != "" {
				rssi = rssiVal
			}
		}
		log.Printf("收到启动扫描指令，RSSI: %s", rssi)
		return onReceiveStart(blueDevice, rssi)

	case communication.STOP:
		log.Println("收到停止扫描指令")
		return onReceiveStop(blueDevice)

	default:
		return communication.CreateErrorResponse(map[string]interface{}{
			"msg": "Unknown command",
		})
	}
}

// onReceiveStart 处理启动扫描指令
func onReceiveStart(blueDevice *bluetooth.BlueDevice, rssi string) string {
	err := blueDevice.StartScan(rssi)
	if err != nil {
		log.Printf("启动扫描失败: %v", err)
		return communication.CreateErrorResponse(map[string]interface{}{
			"msg": err.Error(),
		})
	}
	return communication.CreateStatusResponse(map[string]interface{}{
		"msg": "Scan started",
	})
}

// onReceiveStop 处理停止扫描指令
func onReceiveStop(blueDevice *bluetooth.BlueDevice) string {
	err := blueDevice.StopScan()
	if err != nil {
		log.Printf("停止扫描失败: %v", err)
		return communication.CreateErrorResponse(map[string]interface{}{
			"msg": err.Error(),
		})
	}
	return communication.CreateStatusResponse(map[string]interface{}{
		"msg": "Scan stopped",
	})
}

func main() {
	log.Println("启动蓝牙设备服务...")

	// 创建蓝牙设备和传输层实例
	// 检查是否有模拟模式参数
	var blueDevice *bluetooth.BlueDevice
	if len(os.Args) > 1 && os.Args[1] == "--mock" {
		log.Println("使用模拟模式")
		blueDevice = bluetooth.NewBlueDeviceMock()
	} else {
		blueDevice = bluetooth.NewBlueDevice()
	}
	httpTransport := transport.NewHttpTransport(8888)

	// 连接蓝牙设备
	if err := blueDevice.Connect(); err != nil {
		log.Fatalf("连接蓝牙设备失败: %v", err)
	} else {
		log.Println("蓝牙模块连接成功")
	}

	// 启动HTTP传输层
	if err := httpTransport.Start(); err != nil {
		log.Fatalf("启动HTTP传输层失败: %v", err)
	}

	// 初始化蓝牙设备
	go func() {
		if err := blueDevice.Initialize(); err != nil {
			log.Printf("蓝牙设备初始化失败: %v", err)
		} else {
			log.Println("蓝牙模块初始化完成")
		}
	}()

	// 创建上下文用于优雅关闭
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 监听系统信号
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// 主事件循环
	go func() {
		for {
			select {
			case reqWithCallback := <-httpTransport.ReceiveChannel():
				// 处理来自传输层的指令
				response := handleMessage(blueDevice, reqWithCallback.Request)
				reqWithCallback.Callback(response)

			case deviceEvent := <-blueDevice.GetDeviceEventsChannel():
				// 处理来自蓝牙设备的事件，通过传输层上报
				log.Printf("设备上报: %s", deviceEvent)
				if err := httpTransport.Send(deviceEvent); err != nil {
					log.Printf("发送设备事件失败: %v", err)
				}

			case <-ctx.Done():
				return
			}
		}
	}()

	// 等待退出信号
	<-sigChan
	log.Println("正在关闭程序...")

	// 优雅关闭
	cancel()
	blueDevice.Disconnect()
	httpTransport.Stop()

	log.Println("程序已关闭")
}
