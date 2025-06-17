package bluetooth

import (
	"fmt"
)

const AT_COMMAND_SUFFIX = "\r\n" // 所有 AT 命令都必须以回车换行符结尾
const AT_COMMAND_PREFIX = "AT"   // 所有 AT 命令都必须以 AT 开头
const AT_COMMAND_MODE = "+++"    // 进入AT命令模式,无需回车换行符

const AT_RESTART = "RESTART"
const AT_SET_ROLE = "ROLE=1"
const AT_GET_ROLE = "ROLE?"
const AT_START_OBSERVER = "OBSERVER=1,4,,,"
const AT_STOP_OBSERVER = "OBSERVER=0"

// 进入AT命令模式
func BuildEnterCommandMode() string {
	return AT_COMMAND_MODE
}

// 重启设备
func BuildRestartCommand() string {
	return fmt.Sprintf("%s+%s%s", AT_COMMAND_PREFIX, AT_RESTART, AT_COMMAND_SUFFIX)
}

// 设置设备为单主角色
func BuildSetRoleCommand() string {
	return fmt.Sprintf("%s+%s%s", AT_COMMAND_PREFIX, AT_SET_ROLE, AT_COMMAND_SUFFIX)
}

// 获取设备角色
func BuildQueryRoleCommand() string {
	return fmt.Sprintf("%s+%s%s", AT_COMMAND_PREFIX, AT_GET_ROLE, AT_COMMAND_SUFFIX)
}

// 解析设备角色查询响应
func ParseQueryRoleCommand(data string) string {
	// 根据源项目的实现：data.split('=')[1]
	for i, char := range data {
		if char == '=' && i+1 < len(data) {
			return data[i+1:]
		}
	}
	return data
}

// 设置设备为观察者模式
func BuildObserverCommand(rssi string) string {
	if rssi == "" {
		rssi = "-50" // 默认RSSI阈值，根据协议文档修改为-50
	}
	return fmt.Sprintf("%s+%s%s%s", AT_COMMAND_PREFIX, AT_START_OBSERVER, rssi, AT_COMMAND_SUFFIX)
}

// 停止观察者模式
func BuildStopObserverCommand() string {
	return fmt.Sprintf("%s+%s%s", AT_COMMAND_PREFIX, AT_STOP_OBSERVER, AT_COMMAND_SUFFIX)
}
