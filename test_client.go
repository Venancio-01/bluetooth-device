package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"hjrich.com/bluetooth-device/internal/communication"
)

func main() {
	baseURL := "http://localhost:8888"

	// 测试心跳指令
	fmt.Println("=== 测试心跳指令 ===")
	testHeartbeat(baseURL)

	time.Sleep(1 * time.Second)

	// 测试启动扫描指令
	fmt.Println("\n=== 测试启动扫描指令 ===")
	testStartScan(baseURL, "-50")

	time.Sleep(5 * time.Second)

	// 测试停止扫描指令
	fmt.Println("\n=== 测试停止扫描指令 ===")
	testStopScan(baseURL)

	// 监听SSE事件
	fmt.Println("\n=== 监听SSE事件 ===")
	go listenSSE(baseURL)

	// 再次启动扫描以观察事件
	time.Sleep(2 * time.Second)
	fmt.Println("\n=== 再次启动扫描观察事件 ===")
	testStartScan(baseURL, "-60")

	// 保持程序运行以观察事件
	time.Sleep(10 * time.Second)
	testStopScan(baseURL)
}

func testHeartbeat(baseURL string) {
	request := communication.Request{
		Command: communication.HEARTBEAT,
	}

	response := sendCommand(baseURL, request)
	fmt.Printf("心跳响应: %s\n", response)
}

func testStartScan(baseURL string, rssi string) {
	request := communication.Request{
		Command: communication.START,
		Data: map[string]interface{}{
			"rssi": rssi,
		},
	}

	response := sendCommand(baseURL, request)
	fmt.Printf("启动扫描响应: %s\n", response)
}

func testStopScan(baseURL string) {
	request := communication.Request{
		Command: communication.STOP,
	}

	response := sendCommand(baseURL, request)
	fmt.Printf("停止扫描响应: %s\n", response)
}

func sendCommand(baseURL string, request communication.Request) string {
	jsonData, err := json.Marshal(request)
	if err != nil {
		log.Printf("序列化请求失败: %v", err)
		return ""
	}

	resp, err := http.Post(baseURL+"/command", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("发送请求失败: %v", err)
		return ""
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("读取响应失败: %v", err)
		return ""
	}

	return string(body)
}

func listenSSE(baseURL string) {
	resp, err := http.Get(baseURL + "/events")
	if err != nil {
		log.Printf("连接SSE失败: %v", err)
		return
	}
	defer resp.Body.Close()

	fmt.Println("SSE连接已建立，监听事件...")

	buffer := make([]byte, 1024)
	for {
		n, err := resp.Body.Read(buffer)
		if err != nil {
			if err == io.EOF {
				break
			}
			log.Printf("读取SSE数据失败: %v", err)
			break
		}

		data := string(buffer[:n])
		if data != "" && data != "\n" {
			fmt.Printf("收到SSE事件: %s", data)
		}
	}
}
