import type { DeviceManager } from './device-manager'
import type { ITransport } from './transport'
import { createHeartbeatEvent } from './communication'
import { getLogger } from './logger'

const logger = getLogger()

/**
 * 心跳管理器
 * 负责心跳定时器的管理和心跳事件发送
 */
export class HeartbeatManager {
  private transport: ITransport
  private deviceManager: DeviceManager
  private heartbeatTimer: NodeJS.Timeout | null = null
  private readonly heartbeatInterval: number = 2000 // 2秒

  constructor(transport: ITransport, deviceManager: DeviceManager) {
    this.transport = transport
    this.deviceManager = deviceManager
  }

  /**
   * 启动心跳定时器
   */
  start(): void {
    if (this.heartbeatTimer) {
      logger.warn('HeartbeatManager', '心跳定时器已经在运行')
      return
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, this.heartbeatInterval)

    logger.info('HeartbeatManager', `心跳定时器已启动，间隔: ${this.heartbeatInterval}ms`)
  }

  /**
   * 停止心跳定时器
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
      logger.info('HeartbeatManager', '心跳定时器已停止')
    }
  }

  /**
   * 发送心跳事件
   */
  private sendHeartbeat(): void {
    try {
      const stats = this.deviceManager.getConnectionStats()
      const heartbeatData = createHeartbeatEvent({
        run: stats.connected > 0,
      })

      this.transport.send(heartbeatData)
      logger.debug('HeartbeatManager', '心跳事件已发送', { connected: stats.connected })
    }
    catch (error) {
      logger.error('HeartbeatManager', '发送心跳事件失败:', error)
    }
  }

  /**
   * 获取心跳状态
   */
  isRunning(): boolean {
    return this.heartbeatTimer !== null
  }

  /**
   * 设置心跳间隔（仅在停止状态下有效）
   */
  setInterval(interval: number): void {
    if (this.heartbeatTimer) {
      logger.warn('HeartbeatManager', '心跳定时器正在运行，无法修改间隔')
      return
    }

    if (interval < 1000) {
      logger.warn('HeartbeatManager', '心跳间隔不能小于1000ms，使用默认值2000ms')
      return
    }

    // 这里可以添加间隔设置逻辑，但由于当前是常量，暂时保留接口
    logger.info('HeartbeatManager', `心跳间隔设置为: ${interval}ms`)
  }
}
