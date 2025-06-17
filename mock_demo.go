package main

import (
	"fmt"
	"strings"
	"testing"

	"hjrich.com/bluetooth-device/internal/bluetooth"
	"hjrich.com/bluetooth-device/internal/communication"
)

// 测试通信协议
func TestCommunicationProtocol(t *testing.T) {
	fmt.Println("=== 测试通信协议 ===")

	// 测试创建状态响应
	statusResp := communication.CreateStatusResponse(map[string]interface{}{
		"msg": "Test message",
		"run": true,
	})
	fmt.Printf("状态响应: %s\n", statusResp)

	// 测试创建错误响应
	errorResp := communication.CreateErrorResponse(map[string]interface{}{
		"msg": "Test error",
	})
	fmt.Printf("错误响应: %s\n", errorResp)

	// 测试创建设备事件
	deviceEvent := communication.CreateDeviceEvent(map[string]interface{}{
		"mf": "Apple, Inc.",
	})
	fmt.Printf("设备事件: %s\n", deviceEvent)

	// 测试解析JSON消息
	testJSON := `{"c": 1, "d": {"rssi": "-50"}}`
	request, err := communication.ParseJSONMessage(testJSON)
	if err != nil {
		t.Errorf("解析JSON失败: %v", err)
	} else {
		fmt.Printf("解析结果: Command=%d, Data=%v\n", request.Command, request.Data)
	}
}

// 测试蓝牙协议
func TestBluetoothProtocol(t *testing.T) {
	fmt.Println("\n=== 测试蓝牙协议 ===")

	// 测试各种AT指令构建
	commands := []struct {
		name string
		cmd  string
	}{
		{"进入命令模式", bluetooth.BuildEnterCommandMode()},
		{"重启设备", bluetooth.BuildRestartCommand()},
		{"设置角色", bluetooth.BuildSetRoleCommand()},
		{"查询角色", bluetooth.BuildQueryRoleCommand()},
		{"开始观察", bluetooth.BuildObserverCommand("-50")},
		{"停止观察", bluetooth.BuildStopObserverCommand()},
	}

	for _, cmd := range commands {
		fmt.Printf("%s: %s", cmd.name, strings.TrimSpace(cmd.cmd))
		fmt.Println()
	}

	// 测试角色查询解析
	testData := "ROLE=1"
	result := bluetooth.ParseQueryRoleCommand(testData)
	fmt.Printf("角色解析结果: %s\n", result)
}

// 测试设备数据解析
func TestDeviceDataParsing(t *testing.T) {
	fmt.Println("\n=== 测试设备数据解析 ===")

	// 模拟接收到的蓝牙广播数据
	testData := []string{
		// 模拟Apple设备的广播数据
		"SCAN,1,ADV:020106030302F01A0AFF4C001005031C7E8F5C",
		// 模拟Samsung设备的广播数据
		"SCAN,1,ADV:020106030302F01A0AFF7500100503ABCDEF12",
		// 无效数据
		"INVALID,DATA",
		// 没有FF标识符的数据
		"SCAN,1,ADV:020106030302F01A0A1234567890",
	}

	fmt.Println("模拟解析蓝牙广播数据:")
	for i, data := range testData {
		fmt.Printf("测试数据 %d: %s\n", i+1, data)
		// 注意：这里我们不能直接调用parseData，因为它是私有方法
		// 在实际测试中，我们需要通过公共接口或者重构代码来测试
	}
}

// 测试厂商字典
func TestManufacturerDict(t *testing.T) {
	fmt.Println("\n=== 测试厂商字典 ===")

	testCases := []struct {
		id   string
		name string
	}{
		{"004C", "Apple, Inc."},
		{"0075", "Samsung Electronics Co. Ltd."},
		{"0008", "Motorola"},
		{"XXXX", ""}, // 不存在的厂商ID
	}

	for _, tc := range testCases {
		if manufacturer, exists := bluetooth.ManufacturerDict[tc.id]; exists {
			fmt.Printf("厂商ID %s: %s\n", tc.id, manufacturer)
			if manufacturer != tc.name && tc.name != "" {
				t.Errorf("厂商名称不匹配，期望: %s, 实际: %s", tc.name, manufacturer)
			}
		} else {
			fmt.Printf("厂商ID %s: 未找到\n", tc.id)
			if tc.name != "" {
				t.Errorf("应该找到厂商 %s", tc.name)
			}
		}
	}
}

func main() {
	// 运行所有测试
	fmt.Println("开始运行蓝牙设备Go版本的功能测试")
	fmt.Println("==========================================")

	TestCommunicationProtocol(nil)
	TestBluetoothProtocol(nil)
	TestDeviceDataParsing(nil)
	TestManufacturerDict(nil)

	fmt.Println("\n==========================================")
	fmt.Println("所有测试完成")
}
