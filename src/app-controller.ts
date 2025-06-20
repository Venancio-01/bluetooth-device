import type { ConfigManager } from './config'
import { EventEmitter } from 'events'
import { getConfigManager } from './config'
import { DeviceManager } from './device-manager'
import { HeartbeatManager } from './heartbeat-manager'
import { getLogger, parseLogLevel } from './logger'
import { MessageHandler } from './message-handler'
import { SerialTransport } from './serial-transport'

const logger = getLogger()

/**
 * 应用程序主控制器
 * 负责应用程序的初始化、配置管理、组件协调和生命周期管理
 */
export class AppController extends EventEmitter {
  private deviceManager: DeviceManager | null = null
  private transport: SerialTransport | null = null
  private messageHandler: MessageHandler | null = null
  private heartbeatManager: HeartbeatManager | null = null
  private isInitialized = false

  /**
   * 初始化应用程序
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('AppController', '应用程序已经初始化')
      return
    }

    try {
      // 获取配置管理器
      const configManager = getConfigManager()

      // 初始化日志管理器
      this.initializeLogger(configManager)

      // 验证配置
      this.validateConfiguration(configManager)

      // 初始化设备管理器
      await this.initializeDeviceManager(configManager)

      // 初始化传输层
      await this.initializeTransport(configManager)

      // 初始化消息处理器
      this.initializeMessageHandler()

      // 初始化心跳管理器
      this.initializeHeartbeatManager()

      // 设置事件监听器
      this.setupEventListeners()

      // 启动传输层
      await this.startTransport()

      // 初始化设备
      await this.initializeDevices()

      // 启动心跳
      this.startHeartbeat()

      this.isInitialized = true
      logger.info('AppController', '应用程序初始化完成')
    }
    catch (error) {
      logger.error('AppController', '应用程序初始化失败:', error)
      throw error
    }
  }

  /**
   * 关闭应用程序
   */
  async shutdown(): Promise<void> {
    logger.info('AppController', '正在关闭应用程序...')

    try {
      // 停止心跳
      this.heartbeatManager?.stop()

      // 断开所有设备
      await this.deviceManager?.disconnectAll()

      // 停止传输层
      await this.transport?.stop()

      this.isInitialized = false
      logger.info('AppController', '应用程序已安全关闭')
    }
    catch (error) {
      logger.error('AppController', '关闭应用程序时发生错误:', error)
      throw error
    }
  }

  /**
   * 获取设备管理器
   */
  getDeviceManager(): DeviceManager | null {
    return this.deviceManager
  }

  /**
   * 获取传输层
   */
  getTransport(): SerialTransport | null {
    return this.transport
  }

  /**
   * 初始化日志管理器
   */
  private initializeLogger(configManager: ConfigManager) {
    const loggingConfig = configManager.getLoggingConfig()
    getLogger({
      level: parseLogLevel(loggingConfig.level),
      enableDevicePrefix: loggingConfig.enableDevicePrefix,
      enableTimestamp: true,
    })
    logger.info('AppController', '日志管理器初始化完成')
  }

  /**
   * 验证配置
   */
  private validateConfiguration(configManager: ConfigManager) {
    const validation = configManager.validate()
    if (!validation.valid) {
      logger.error('AppController', '配置验证失败:')
      validation.errors.forEach((error: string) => logger.error('AppController', `  - ${error}`))
      throw new Error('配置验证失败')
    }
    logger.info('AppController', '配置验证通过')
  }

  /**
   * 初始化设备管理器
   */
  private async initializeDeviceManager(configManager: ConfigManager) {
    const config = configManager.getConfig()
    const deviceConfigs = configManager.getDeviceConfigs() // 使用过滤后的设备配置
    if (deviceConfigs.length === 0) {
      throw new Error('没有启用的设备配置')
    }

    logger.info('AppController', `加载了 ${deviceConfigs.length} 个启用的设备配置:`)
    deviceConfigs.forEach((device) => {
      logger.info('AppController', `  - ${device.deviceId}: ${device.serialPath} (enabled: ${device.enabled})`)
    })

    // 检查是否有被禁用的设备
    const allDevices = config.devices
    const disabledDevices = allDevices.filter(device => !device.enabled)
    if (disabledDevices.length > 0) {
      logger.info('AppController', `跳过了 ${disabledDevices.length} 个禁用的设备配置:`)
      disabledDevices.forEach((device) => {
        logger.info('AppController', `  - ${device.deviceId}: ${device.serialPath} (enabled: ${device.enabled})`)
      })
    }

    this.deviceManager = new DeviceManager(config)
    logger.info('AppController', '设备管理器初始化完成')
  }

  /**
   * 初始化传输层
   */
  private async initializeTransport(configManager: ConfigManager) {
    const transportConfig = configManager.getTransportConfig()
    this.transport = new SerialTransport(transportConfig)
    logger.info('AppController', '传输层初始化完成')
  }

  /**
   * 初始化消息处理器
   */
  private initializeMessageHandler() {
    if (!this.deviceManager) {
      throw new Error('设备管理器未初始化')
    }
    const configManager = getConfigManager()
    const config = configManager.getConfig()
    this.messageHandler = new MessageHandler(this.deviceManager, config)
    logger.info('AppController', '消息处理器初始化完成')
  }

  /**
   * 初始化心跳管理器
   */
  private initializeHeartbeatManager() {
    if (!this.transport || !this.deviceManager) {
      throw new Error('传输层或设备管理器未初始化')
    }
    this.heartbeatManager = new HeartbeatManager(this.transport, this.deviceManager)
    logger.info('AppController', '心跳管理器初始化完成')
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    if (!this.transport || !this.deviceManager || !this.messageHandler) {
      throw new Error('组件未完全初始化')
    }

    // 监听来自传输层的指令
    this.transport.on('data', (message, cb) => {
      this.messageHandler!.handleMessage(message, cb)
    })

    // 监听传输层错误事件
    this.transport.on('error', (error, cb) => {
      logger.error('AppController', '传输层错误:', error)
      this.messageHandler!.handleError(error, cb)
    })

    // 监听设备管理器的设备事件，并通过传输层上报
    this.deviceManager.on('device', (device) => {
      const event = this.messageHandler!.handleDeviceEvent(device as Record<string, unknown>)
      this.transport!.send(event)
    })

    // 监听设备连接事件
    this.deviceManager.on('deviceConnected', (info) => {
      logger.info('AppController', `设备 ${info.deviceId} (${info.serialPath}) 连接成功`)
    })

    // 监听设备断开连接事件
    this.deviceManager.on('deviceDisconnected', (info) => {
      logger.warn('AppController', `设备 ${info.deviceId} (${info.serialPath}) 断开连接`)
    })

    // 监听设备错误事件
    this.deviceManager.on('deviceError', (error) => {
      logger.error('AppController', `设备 ${error.deviceId} (${error.serialPath}) 发生错误:`, error.error)
    })

    logger.info('AppController', '事件监听器设置完成')
  }

  /**
   * 启动传输层
   */
  private async startTransport() {
    if (!this.transport) {
      throw new Error('传输层未初始化')
    }

    await this.transport.start()
    logger.info('AppController', '传输层启动成功')
  }

  /**
   * 初始化设备
   */
  private async initializeDevices() {
    if (!this.deviceManager) {
      throw new Error('设备管理器未初始化')
    }

    await this.deviceManager.initializeDevices()
    const stats = this.deviceManager.getConnectionStats()
    logger.info('AppController', `设备初始化完成: ${stats.connected}/${stats.total} 个设备连接成功`)

    if (stats.reconnecting > 0) {
      logger.info('AppController', `${stats.reconnecting} 个设备正在重连中`)
    }

    if (stats.connected === 0 && stats.reconnecting === 0) {
      throw new Error('没有设备连接成功')
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat() {
    if (!this.heartbeatManager) {
      throw new Error('心跳管理器未初始化')
    }

    this.heartbeatManager.start()
    logger.info('AppController', '心跳定时器已启动')
  }
}
