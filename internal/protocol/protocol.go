// Package protocol 封装蓝牙模块的 AT 指令协议
package protocol

const (
	// AT 指令常量
	ATCommandSuffix = "\r\n" // 所有 AT 命令都必须以回车换行符结尾
	ATCommandPrefix = "AT"   // 所有 AT 命令都必须以 AT 开头
	ATCommandMode   = "+++"  // 进入AT命令模式,无需回车换行符

	// AT 指令类型
	ATRestart       = "RESTART"
	ATSetRole       = "ROLE=1"
	ATGetRole       = "ROLE?"
	ATStartObserver = "OBSERVER=1,4,,,"
	ATStopObserver  = "OBSERVER=0"
)

// BuildEnterCommandMode 进入AT命令模式
func BuildEnterCommandMode() string {
	return ATCommandMode
}

// BuildRestartCommand 重启设备
func BuildRestartCommand() string {
	return ATCommandPrefix + "+" + ATRestart + ATCommandSuffix
}

// BuildSetRoleCommand 设置设备为单主角色
func BuildSetRoleCommand() string {
	return ATCommandPrefix + "+" + ATSetRole + ATCommandSuffix
}

// BuildQueryRoleCommand 获取设备角色
func BuildQueryRoleCommand() string {
	return ATCommandPrefix + "+" + ATGetRole + ATCommandSuffix
}

// BuildObserverCommand 设置设备为观察者模式
func BuildObserverCommand(rssi string) string {
	return ATCommandPrefix + "+" + ATStartObserver + rssi + ATCommandSuffix
}

// BuildStopObserverCommand 停止观察者模式
func BuildStopObserverCommand() string {
	return ATCommandPrefix + "+" + ATStopObserver + ATCommandSuffix
}

// ParseQueryRoleCommand 解析角色查询响应
func ParseQueryRoleCommand(data string) string {
	// 简单的字符串分割，实际实现可能需要更复杂的解析
	if len(data) > 0 && data[0] == '=' {
		return data[1:]
	}
	return data
}
