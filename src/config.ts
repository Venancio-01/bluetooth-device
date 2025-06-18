import type { DeviceConfig } from './device-manager'
import fs from 'fs'
import path from 'path'
import process from 'process'
import { z } from 'zod'
import { getLogger } from './logger'

const logger = getLogger()

// 配置文件模式定义
const DeviceConfigSchema = z.object({
  serialPath: z.string(),
  deviceId: z.string().optional(),
  baudRate: z.number().optional().default(115200),
  enabled: z.boolean().optional().default(true),
})

const HttpTransportConfigSchema = z.object({
  type: z.literal('http'),
  port: z.number().optional().default(8888),
})

const SerialTransportConfigSchema = z.object({
  type: z.literal('serial'),
  serialPath: z.string(),
  baudRate: z.number().optional().default(115200),
  dataBits: z.number().optional().default(8),
  stopBits: z.number().optional().default(1),
  parity: z.enum(['none', 'even', 'odd']).optional().default('none'),
  timeout: z.number().optional().default(5000), // 超时时间（毫秒）
})

const AppConfigSchema = z.object({
  devices: z.array(DeviceConfigSchema),
  enabledTransports: z.enum(['http', 'serial']).optional().default('http'),
  httpTransport: HttpTransportConfigSchema.optional().default({ type: 'http', port: 8888 }),
  serialTransport: SerialTransportConfigSchema.optional().default({ type: 'serial', serialPath: '/dev/ttyUSB0', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', timeout: 5000 }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
    enableDevicePrefix: z.boolean().optional().default(true),
  }).optional().default({ level: 'info', enableDevicePrefix: true }),
})

export type AppConfig = z.infer<typeof AppConfigSchema>
export type DeviceConfigWithOptions = z.infer<typeof DeviceConfigSchema>
export type HttpTransportConfig = z.infer<typeof HttpTransportConfigSchema>
export type SerialTransportConfig = z.infer<typeof SerialTransportConfigSchema>

const DEFAULT_CONFIG: AppConfig = {
  devices: [
    {
      serialPath: '/dev/ttyUSB0',
      deviceId: 'device_0',
      baudRate: 115200,
      enabled: true,
    },
  ],
  enabledTransports: 'http',
  httpTransport: {
    type: 'http',
    port: 8888,
  },
  serialTransport: {
    type: 'serial',
    serialPath: '/dev/ttyUSB1',
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    timeout: 5000,
  },
  logging: {
    level: 'info',
    enableDevicePrefix: true,
  },
}

/**
 * 配置管理器
 */
export class ConfigManager {
  private config: AppConfig
  private configPath: string

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath()
    this.config = this.loadConfig()
  }

  /**
   * 获取默认配置文件路径
   */
  private getDefaultConfigPath(): string {
    // 优先使用环境变量指定的配置文件路径
    if (process.env['CONFIG_PATH']) {
      return process.env['CONFIG_PATH']
    }

    // 默认配置文件路径
    return path.join(process.cwd(), 'config.json')
  }

  /**
   * 加载配置
   */
  private loadConfig(): AppConfig {
    try {
      // 尝试从配置文件加载
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf-8')
        const jsonConfig = JSON.parse(configContent)
        const validatedConfig = AppConfigSchema.parse(jsonConfig)
        logger.info('ConfigManager', `从配置文件加载配置: ${this.configPath}`)
        return validatedConfig
      }

      // 如果没有配置文件，创建默认配置文件
      logger.info('ConfigManager', '未找到配置文件，创建默认配置')
      this.saveConfig(DEFAULT_CONFIG)
      return DEFAULT_CONFIG
    }
    catch (error) {
      logger.error('ConfigManager', '加载配置失败，使用默认配置:', error)
      return DEFAULT_CONFIG
    }
  }

  /**
   * 保存配置到文件
   */
  private saveConfig(config: AppConfig): void {
    try {
      const configContent = JSON.stringify(config, null, 2)
      fs.writeFileSync(this.configPath, configContent, 'utf-8')
      logger.info('ConfigManager', `配置已保存到: ${this.configPath}`)
    }
    catch (error) {
      logger.error('ConfigManager', '保存配置失败:', error)
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): AppConfig {
    return this.config
  }

  /**
   * 获取设备配置列表
   */
  getDeviceConfigs(): DeviceConfig[] {
    return this.config.devices
      .filter(device => device.enabled)
      .map(device => ({
        serialPath: device.serialPath,
        deviceId: device.deviceId || '',
      }))
  }

  /**
   * 获取传输层配置
   */
  getTransportConfig() {
    return this.config.enabledTransports === 'http' ? this.config.httpTransport : this.config.serialTransport
  }

  /**
   * 获取日志配置
   */
  getLoggingConfig() {
    return this.config.logging
  }

  /**
   * 添加设备配置
   */
  addDevice(deviceConfig: DeviceConfigWithOptions): void {
    this.config.devices.push(deviceConfig)
    this.saveConfig(this.config)
  }

  /**
   * 移除设备配置
   */
  removeDevice(serialPath: string): boolean {
    const initialLength = this.config.devices.length
    this.config.devices = this.config.devices.filter(device => device.serialPath !== serialPath)

    if (this.config.devices.length < initialLength) {
      this.saveConfig(this.config)
      return true
    }
    return false
  }

  /**
   * 启用/禁用设备
   */
  setDeviceEnabled(serialPath: string, enabled: boolean): boolean {
    const device = this.config.devices.find(d => d.serialPath === serialPath)
    if (device) {
      device.enabled = enabled
      this.saveConfig(this.config)
      return true
    }
    return false
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    this.config = this.loadConfig()
  }

  /**
   * 验证配置
   */
  validate(): { valid: boolean, errors: string[] } {
    const errors: string[] = []

    // 检查设备配置
    const enabledDevices = this.config.devices.filter(d => d.enabled)
    if (enabledDevices.length === 0) {
      errors.push('至少需要启用一个设备')
    }

    // 检查串口路径重复
    const serialPaths = enabledDevices.map(d => d.serialPath)
    const duplicates = serialPaths.filter((path, index) => serialPaths.indexOf(path) !== index)
    if (duplicates.length > 0) {
      errors.push(`串口路径重复: ${duplicates.join(', ')}`)
    }

    // 检查设备ID重复
    const deviceIds = enabledDevices.map(d => d.deviceId).filter(Boolean)
    const duplicateIds = deviceIds.filter((id, index) => deviceIds.indexOf(id) !== index)
    if (duplicateIds.length > 0) {
      errors.push(`设备ID重复: ${duplicateIds.join(', ')}`)
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

// 全局配置管理器实例
let configManager: ConfigManager | null = null

/**
 * 获取配置管理器实例
 */
export function getConfigManager(configPath?: string): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager(configPath)
  }
  return configManager
}

/**
 * 重置配置管理器实例（主要用于测试）
 */
export function resetConfigManager(): void {
  configManager = null
}
