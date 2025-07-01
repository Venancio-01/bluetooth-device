// Package utils 工具函数
package utils

import (
	"time"
)

// Sleep 睡眠指定毫秒数
func Sleep(ms int) {
	time.Sleep(time.Duration(ms) * time.Millisecond)
}

// GetFormattedDateTimeWithMilliseconds 获取格式化的日期时间（包含毫秒）
func GetFormattedDateTimeWithMilliseconds() string {
	now := time.Now()
	return now.Format("2006-01-02 15:04:05.000")
}
