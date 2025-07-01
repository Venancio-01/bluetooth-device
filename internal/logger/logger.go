// Package logger 统一的日志管理系统
package logger

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// LogLevel 日志级别
type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarn
	LogLevelError
)

// String 返回日志级别的字符串表示
func (l LogLevel) String() string {
	switch l {
	case LogLevelDebug:
		return "DEBUG"
	case LogLevelInfo:
		return "INFO"
	case LogLevelWarn:
		return "WARN"
	case LogLevelError:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

// ParseLogLevel 解析日志级别字符串
func ParseLogLevel(level string) LogLevel {
	switch strings.ToLower(level) {
	case "debug":
		return LogLevelDebug
	case "info":
		return LogLevelInfo
	case "warn", "warning":
		return LogLevelWarn
	case "error":
		return LogLevelError
	default:
		return LogLevelInfo
	}
}

// LoggerConfig 日志配置
type LoggerConfig struct {
	Level              LogLevel // 日志级别
	EnableDevicePrefix bool     // 启用设备前缀
	EnableTimestamp    bool     // 启用时间戳
}

// Logger 日志器
type Logger struct {
	config LoggerConfig
	logger *log.Logger
}

// 全局日志器实例
var globalLogger *Logger

// NewLogger 创建新的日志器
func NewLogger(config LoggerConfig) *Logger {
	return &Logger{
		config: config,
		logger: log.New(os.Stdout, "", 0), // 不使用默认的时间戳格式
	}
}

// InitGlobalLogger 初始化全局日志器
func InitGlobalLogger(config LoggerConfig) {
	globalLogger = NewLogger(config)
}

// GetLogger 获取全局日志器
func GetLogger() *Logger {
	if globalLogger == nil {
		// 使用默认配置
		globalLogger = NewLogger(LoggerConfig{
			Level:              LogLevelInfo,
			EnableDevicePrefix: true,
			EnableTimestamp:    true,
		})
	}
	return globalLogger
}

// formatMessage 格式化消息
func (l *Logger) formatMessage(level LogLevel, component string, message string) string {
	var parts []string

	// 添加时间戳
	if l.config.EnableTimestamp {
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		parts = append(parts, timestamp)
	}

	// 添加日志级别
	parts = append(parts, fmt.Sprintf("[%s]", level.String()))

	// 添加组件名称
	if component != "" {
		parts = append(parts, fmt.Sprintf("[%s]", component))
	}

	// 添加消息
	parts = append(parts, message)

	return strings.Join(parts, " ")
}

// shouldLog 判断是否应该记录日志
func (l *Logger) shouldLog(level LogLevel) bool {
	return level >= l.config.Level
}

// log 记录日志
func (l *Logger) log(level LogLevel, component string, args ...interface{}) {
	if !l.shouldLog(level) {
		return
	}

	message := fmt.Sprint(args...)
	formattedMessage := l.formatMessage(level, component, message)
	l.logger.Println(formattedMessage)
}

// logf 格式化记录日志
func (l *Logger) logf(level LogLevel, component string, format string, args ...interface{}) {
	if !l.shouldLog(level) {
		return
	}

	message := fmt.Sprintf(format, args...)
	formattedMessage := l.formatMessage(level, component, message)
	l.logger.Println(formattedMessage)
}

// Debug 记录调试日志
func (l *Logger) Debug(component string, args ...interface{}) {
	l.log(LogLevelDebug, component, args...)
}

// Debugf 格式化记录调试日志
func (l *Logger) Debugf(component string, format string, args ...interface{}) {
	l.logf(LogLevelDebug, component, format, args...)
}

// Info 记录信息日志
func (l *Logger) Info(component string, args ...interface{}) {
	l.log(LogLevelInfo, component, args...)
}

// Infof 格式化记录信息日志
func (l *Logger) Infof(component string, format string, args ...interface{}) {
	l.logf(LogLevelInfo, component, format, args...)
}

// Warn 记录警告日志
func (l *Logger) Warn(component string, args ...interface{}) {
	l.log(LogLevelWarn, component, args...)
}

// Warnf 格式化记录警告日志
func (l *Logger) Warnf(component string, format string, args ...interface{}) {
	l.logf(LogLevelWarn, component, format, args...)
}

// Error 记录错误日志
func (l *Logger) Error(component string, args ...interface{}) {
	l.log(LogLevelError, component, args...)
}

// Errorf 格式化记录错误日志
func (l *Logger) Errorf(component string, format string, args ...interface{}) {
	l.logf(LogLevelError, component, format, args...)
}

// SetLevel 设置日志级别
func (l *Logger) SetLevel(level LogLevel) {
	l.config.Level = level
}

// GetLevel 获取当前日志级别
func (l *Logger) GetLevel() LogLevel {
	return l.config.Level
}

// 全局日志函数，方便使用
func Debug(component string, args ...interface{}) {
	GetLogger().Debug(component, args...)
}

func Debugf(component string, format string, args ...interface{}) {
	GetLogger().Debugf(component, format, args...)
}

func Info(component string, args ...interface{}) {
	GetLogger().Info(component, args...)
}

func Infof(component string, format string, args ...interface{}) {
	GetLogger().Infof(component, format, args...)
}

func Warn(component string, args ...interface{}) {
	GetLogger().Warn(component, args...)
}

func Warnf(component string, format string, args ...interface{}) {
	GetLogger().Warnf(component, format, args...)
}

func Error(component string, args ...interface{}) {
	GetLogger().Error(component, args...)
}

func Errorf(component string, format string, args ...interface{}) {
	GetLogger().Errorf(component, format, args...)
}
