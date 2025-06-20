import type { AppConfig } from './config'
import type { DeviceManager } from './device-manager'
import type { ResponseCallback } from './serial-transport'
import {
  CommandCode,
  createDeviceEvent,
  createErrorResponse,
  createStatusResponse,
  parseRequestData,
  type RequestPayload,
} from './communication'
import { getLogger } from './logger'

const logger = getLogger()

/**
 * 消息处理器
 * 负责处理来自传输层的消息和命令分发
 */
export class MessageHandler {
  private deviceManager: DeviceManager
  private config: AppConfig

  constructor(deviceManager: DeviceManager, config: AppConfig) {
    this.deviceManager = deviceManager
    this.config = config
  }

  /**
   * 处理来自传输层的消息
   * @param message JSON 字符串消息
   * @param cb      响应回调
   */
  async handleMessage(message: RequestPayload, cb: ResponseCallback): Promise<void> {
    const request = message
    if (!request) {
      const errorResponse = createErrorResponse('Invalid message format')
      return cb(errorResponse)
    }

    try {
      switch (request.c) {
        case CommandCode.START:
          return cb(await this.handleStartCommand(request.d))

        case CommandCode.STOP:
          return cb(await this.handleStopCommand())

        default:
          return cb(createErrorResponse('Unknown command'))
      }
    }
    catch (error: any) {
      logger.error('MessageHandler', '处理指令时发生错误:', error)
      return cb(createErrorResponse(error.message || 'Failed to execute command'))
    }
  }

  /**
   * 处理错误
   * @param error 错误信息
   * @param cb    响应回调
   */
  handleError(error: string, cb: ResponseCallback): void {
    cb(createErrorResponse(error))
  }

  /**
   * 处理设备事件
   * @param device 设备数据
   * @returns 设备事件消息
   */
  handleDeviceEvent(device: Record<string, unknown>): string {
    // 创建设备事件消息
    return createDeviceEvent(device)
  }

  /**
   * 处理启动扫描指令
   * @param requestData 请求数据
   * @returns 启动扫描响应
   */
  private async handleStartCommand(requestData: unknown): Promise<string> {
    const data = parseRequestData(requestData)

    // 根据 useConfigRssi 配置决定使用哪个 RSSI 值
    let rssi: string
    if (this.config.useConfigRssi) {
      // 使用配置文件中的 RSSI 值
      rssi = this.config.rssi
      logger.info('MessageHandler', '使用配置文件中的 RSSI 值', { rssi })
    }
    else {
      // 使用上位机传入的 RSSI 值，如果没有传入则使用配置文件中的值作为默认值
      rssi = data?.rssi || this.config.rssi
      logger.info('MessageHandler', '使用上位机传入的 RSSI 值', { rssi: data?.rssi, defaultRssi: this.config.rssi })
    }

    logger.info('MessageHandler', '收到启动扫描指令', {
      rssi,
      useConfigRssi: this.config.useConfigRssi,
    })

    // try {
    //   await this.deviceManager.startScan(rssi)
    //   logger.info('MessageHandler', '所有设备开始扫描')
    //   return createStatusResponse({ msg: 'Scan started' })
    // }
    // catch (error: any) {
    //   logger.error('MessageHandler', '启动扫描失败:', error)
    //   return createErrorResponse(error.message || 'Failed to start scan')
    // }

    try {
      await this.deviceManager.startReport(rssi)
      logger.info('MessageHandler', '所有设备开始上报', { rssi })
      return createStatusResponse({ msg: 'Report started' })
    }
    catch (error: any) {
      logger.error('MessageHandler', '启动上报失败:', error)
      return createErrorResponse(error.message || 'Failed to start report')
    }
  }

  /**
   * 处理停止扫描指令
   * @returns 停止扫描响应
   */
  private async handleStopCommand(): Promise<string> {
    // try {
    //   await this.deviceManager.stopScan()
    //   logger.info('MessageHandler', '所有设备停止扫描')
    //   return createStatusResponse({ msg: 'Scan stopped' })
    // }
    // catch (error: any) {
    //   logger.error('MessageHandler', '停止扫描失败:', error)
    //   return createErrorResponse(error.message || 'Failed to stop scan')
    // }

    try {
      await this.deviceManager.stopReport()
      logger.info('MessageHandler', '所有设备停止上报')
      return createStatusResponse({ msg: 'Report stopped' })
    }
    catch (error: any) {
      logger.error('MessageHandler', '停止上报失败:', error)
      return createErrorResponse(error.message || 'Failed to stop report')
    }
  }
}
