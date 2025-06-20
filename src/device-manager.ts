import type { AppConfig, DeviceConfigWithOptions } from './config'
import { EventEmitter } from 'events'
import { BlueDevice } from './blue-device'
import { getLogger } from './logger'

const logger = getLogger()

export interface DeviceInfo {
  deviceId: string
  serialPath: string
  connected: boolean
  initialized: boolean
  scanning: boolean
}

export class DeviceManager extends EventEmitter {
  private config: AppConfig
  private devices: Map<string, BlueDevice> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private maxReconnectAttempts = 5
  private reconnectDelay = 10000 // 10秒

  constructor(config: AppConfig) {
    super()
    this.config = config
  }

  get deviceConfigs() {
    // 只返回启用的设备配置
    return this.config.devices.filter(device => device.enabled)
  }

  /**
   * 获取所有设备配置（仅启用的设备）
   */
  getDeviceConfigs(): DeviceConfigWithOptions[] {
    return [...this.deviceConfigs]
  }

  /**
   * 初始化所有设备
   */
  async initializeDevices(): Promise<void> {
    const initPromises = this.deviceConfigs.map(config => this.initializeDevice(config))
    const results = await Promise.allSettled(initPromises)

    // 记录初始化失败的设备
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const config = this.deviceConfigs[index]
        logger.error('DeviceManager', `[${config?.deviceId || config?.serialPath}] 初始化失败:`, result.reason)
      }
    })
  }

  /**
   * 初始化单个设备
   */
  private async initializeDevice(config: DeviceConfigWithOptions): Promise<void> {
    const device = new BlueDevice({
      serialPath: config.serialPath,
      deviceId: config.deviceId || '',
      reportInterval: this.config.reportInterval,
      rssi: this.config.rssi,
    })
    const deviceId = device.getDeviceId()

    // 监听设备事件并转发
    device.on('device', (deviceData) => {
      logger.info('DeviceManager', `[${deviceId}] 上报:`, deviceData)
      this.emit('device', deviceData)
    })

    // 监听设备错误
    device.on('error', (error) => {
      logger.error('DeviceManager', `[${deviceId}] 错误:`, error)
      this.emit('deviceError', {
        deviceId,
        serialPath: device.getSerialPath(),
        error,
      })
    })

    // 监听设备断开连接
    device.on('disconnected', () => {
      logger.warn('DeviceManager', `[${deviceId}] 断开连接`)
      this.devices.delete(deviceId)
      this.emit('deviceDisconnected', {
        deviceId,
        serialPath: device.getSerialPath(),
      })

      // 尝试重连
      this.scheduleReconnect(config, deviceId)
    })

    try {
      await device.connect()
      logger.info('DeviceManager', `[${deviceId}] 连接成功`)

      await device.initialize()
      logger.info('DeviceManager', `[${deviceId}] 初始化完成`)

      this.devices.set(deviceId, device)

      this.emit('deviceConnected', {
        deviceId,
        serialPath: device.getSerialPath(),
      })
    }
    catch (error) {
      logger.error('DeviceManager', `[${deviceId}] 连接或初始化失败:`, error)
      throw error
    }
  }

  /**
   * 获取所有设备信息
   */
  getDevicesInfo(): DeviceInfo[] {
    return Array.from(this.devices.entries()).map(([deviceId, device]) => {
      const status = device.getStatus()
      return {
        deviceId,
        serialPath: device.getSerialPath(),
        connected: status.connected,
        initialized: status.initializeState === 'initialized',
        scanning: status.isScanning,
      }
    })
  }

  /**
   * 获取特定设备
   */
  getDevice(deviceId: string): BlueDevice | undefined {
    return this.devices.get(deviceId)
  }

  /**
   * 获取所有设备
   */
  getAllDevices(): BlueDevice[] {
    return Array.from(this.devices.values())
  }

  /**
   * 启动扫描 - 支持指定设备或所有设备
   */
  async startScan(rssi: string = this.config.rssi, deviceId?: string): Promise<void> {
    if (deviceId) {
      // 启动指定设备的扫描
      const device = this.devices.get(deviceId)
      if (!device) {
        throw new Error(`设备 ${deviceId} 不存在`)
      }
      await device.startScan(rssi)
      logger.info('DeviceManager', `[${deviceId}] 开始上报`)
    }
    else {
      // 启动所有设备的扫描
      const startPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.startScan(rssi)
          logger.info('DeviceManager', `[${id}] 开始扫描`)
        }
        catch (error) {
          logger.error('DeviceManager', `[${id}] 启动扫描失败:`, error)
        }
      })
      await Promise.allSettled(startPromises)
    }
  }

  /**
   * 停止扫描 - 支持指定设备或所有设备
   */
  async stopScan(deviceId?: string): Promise<void> {
    if (deviceId) {
      // 停止指定设备的扫描
      const device = this.devices.get(deviceId)
      if (!device) {
        throw new Error(`设备 ${deviceId} 不存在`)
      }
      await device.stopScan()
      logger.info('DeviceManager', `[${deviceId}] 停止扫描`)
    }
    else {
      // 停止所有设备的扫描
      const stopPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.stopScan()
          logger.info('DeviceManager', `[${id}] 停止扫描`)
        }
        catch (error) {
          logger.error('DeviceManager', `[${id}] 停止扫描失败:`, error)
        }
      })
      await Promise.allSettled(stopPromises)
    }
  }

  /**
   * 启动上报 - 支持指定设备或所有设备
   */
  async startReport(rssi?: string, deviceId?: string): Promise<void> {
    if (deviceId) {
      // 启动指定设备的扫描
      const device = this.devices.get(deviceId)
      if (!device) {
        throw new Error(`设备 ${deviceId} 不存在`)
      }
      await device.startReport(rssi)
      logger.info('DeviceManager', `[${deviceId}] 开始上报`, { rssi: rssi || '使用默认值' })
    }
    else {
      // 启动所有设备的扫描
      const startPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.startReport(rssi)
          logger.info('DeviceManager', `[${id}] 开始上报`, { rssi: rssi || '使用默认值' })
        }
        catch (error) {
          logger.error('DeviceManager', `[${id}] 启动上报失败:`, error)
        }
      })
      await Promise.allSettled(startPromises)
    }
  }

  /**
   * 停止上报 - 支持指定设备或所有设备
   */
  async stopReport(deviceId?: string): Promise<void> {
    if (deviceId) {
      // 停止指定设备的扫描
      const device = this.devices.get(deviceId)
      if (!device) {
        throw new Error(`设备 ${deviceId} 不存在`)
      }
      await device.stopReport()
      logger.info('DeviceManager', `[${deviceId}] 停止上报`)
    }
    else {
      // 停止所有设备的扫描
      const stopPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.stopReport()
          logger.info('DeviceManager', `[${id}] 停止上报`)
        }
        catch (error) {
          logger.error('DeviceManager', `[${id}] 停止上报失败:`, error)
        }
      })
      await Promise.allSettled(stopPromises)
    }
  }

  /**
   * 断开所有设备连接
   */
  async disconnectAll(): Promise<void> {
    // 取消所有重连定时器
    this.cancelAllReconnectTimers()

    const disconnectPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
      try {
        await device.disconnect()
        logger.info('DeviceManager', `[${id}] 断开连接`)
      }
      catch (error) {
        logger.error('DeviceManager', `[${id}] 断开连接失败:`, error)
      }
    })

    await Promise.allSettled(disconnectPromises)
    this.devices.clear()
  }

  /**
   * 重新连接失败的设备
   */
  async reconnectFailedDevices(): Promise<void> {
    const connectedDeviceIds = new Set(this.devices.keys())
    const failedConfigs = this.deviceConfigs.filter((config) => {
      const deviceId = config.deviceId || config.serialPath.replace(/[^a-z0-9]/gi, '_')
      return !connectedDeviceIds.has(deviceId)
    })

    if (failedConfigs.length > 0) {
      logger.info('DeviceManager', `尝试重新连接 ${failedConfigs.length} 个失败的设备`)
      const reconnectPromises = failedConfigs.map(config => this.initializeDevice(config))
      await Promise.allSettled(reconnectPromises)
    }
  }

  /**
   * 调度设备重连
   */
  private scheduleReconnect(config: DeviceConfigWithOptions, deviceId: string) {
    const attempts = this.reconnectAttempts.get(deviceId) || 0

    if (attempts >= this.maxReconnectAttempts) {
      logger.error('DeviceManager', `[${deviceId}] 重连次数已达上限 (${this.maxReconnectAttempts})，停止重连`)
      this.reconnectAttempts.delete(deviceId)
      return
    }

    const delay = this.reconnectDelay * 2 ** attempts // 指数退避
    logger.info('DeviceManager', `将在 ${delay}ms 后尝试重连设备 ${deviceId} (第 ${attempts + 1} 次)`)

    const timer = setTimeout(async () => {
      try {
        logger.info('DeviceManager', `开始重连设备 ${deviceId}`)
        await this.initializeDevice(config)
        this.reconnectAttempts.delete(deviceId)
        logger.info('DeviceManager', `设备 ${deviceId} 重连成功`)
      }
      catch (error) {
        logger.error('DeviceManager', `[${deviceId}] 重连失败:`, error)
        this.reconnectAttempts.set(deviceId, attempts + 1)
        this.scheduleReconnect(config, deviceId)
      }
      this.reconnectTimers.delete(deviceId)
    }, delay)

    this.reconnectTimers.set(deviceId, timer)
    this.reconnectAttempts.set(deviceId, attempts + 1)
  }

  /**
   * 取消所有重连定时器
   */
  private cancelAllReconnectTimers() {
    this.reconnectTimers.forEach((timer, deviceId) => {
      logger.info('DeviceManager', `取消设备 ${deviceId} 的重连定时器`)
      clearTimeout(timer)
    })
    this.reconnectTimers.clear()
    this.reconnectAttempts.clear()
  }

  /**
   * 获取连接状态统计
   */
  getConnectionStats(): { total: number, connected: number, failed: number, reconnecting: number } {
    return {
      total: this.deviceConfigs.length,
      connected: this.devices.size,
      failed: this.deviceConfigs.length - this.devices.size - this.reconnectTimers.size,
      reconnecting: this.reconnectTimers.size,
    }
  }
}
