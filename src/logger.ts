import { getFormattedDateTimeWithMilliseconds } from './utils'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  level: LogLevel
  enableDevicePrefix: boolean
  enableTimestamp: boolean
}

export class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? LogLevel.INFO,
      enableDevicePrefix: config.enableDevicePrefix ?? true,
      enableTimestamp: config.enableTimestamp ?? true,
    }
  }

  private formatMessage(level: string, component: string, message: string): string {
    const parts: string[] = []

    if (this.config.enableTimestamp) {
      parts.push(getFormattedDateTimeWithMilliseconds())
    }

    parts.push(`[${level}]`)

    if (component) {
      parts.push(`[${component}]`)
    }

    parts.push(message)

    return parts.join(' ')
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level
  }

  debug(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', component, message), ...args)
    }
  }

  info(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', component, message), ...args)
    }
  }

  warn(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', component, message), ...args)
    }
  }

  error(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', component, message), ...args)
    }
  }

  // 设备专用日志方法
  deviceDebug(deviceId: string, message: string, ...args: any[]): void {
    this.debug(deviceId, message, ...args)
  }

  deviceInfo(deviceId: string, message: string, ...args: any[]): void {
    this.info(deviceId, message, ...args)
  }

  deviceWarn(deviceId: string, message: string, ...args: any[]): void {
    this.warn(deviceId, message, ...args)
  }

  deviceError(deviceId: string, message: string, ...args: any[]): void {
    this.error(deviceId, message, ...args)
  }

  // 更新配置
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // 获取当前配置
  getConfig(): LoggerConfig {
    return { ...this.config }
  }
}

// 全局日志实例
let globalLogger: Logger | null = null

/**
 * 获取全局日志实例
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config)
  }
  else if (config) {
    globalLogger.updateConfig(config)
  }
  return globalLogger
}

/**
 * 重置全局日志实例（主要用于测试）
 */
export function resetLogger(): void {
  globalLogger = null
}

/**
 * 将字符串日志级别转换为枚举
 */
export function parseLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG
    case 'info':
      return LogLevel.INFO
    case 'warn':
    case 'warning':
      return LogLevel.WARN
    case 'error':
      return LogLevel.ERROR
    default:
      return LogLevel.INFO
  }
}
