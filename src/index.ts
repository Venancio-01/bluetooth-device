import type { ITransport, ResponseCallback } from './transport'
import process from 'process'
import {
  CommandCode,
  createDeviceEvent,
  createErrorResponse,
  createStatusResponse,
  parseRequestData,
} from './communication'
import { getConfigManager } from './config'
import { DeviceManager } from './device-manager'
import { HttpTransport } from './http-transport'
import { getLogger, parseLogLevel } from './logger'
import { SerialTransport } from './serial-transport'

let deviceManager: DeviceManager | null = null
let transport: ITransport | null = null

/**
 * 处理来自传输层的消息
 * @param message JSON 字符串消息
 * @param cb      响应回调
 */
async function handleMessage(message: any, cb: ResponseCallback) {
  const request = message
  if (!request) {
    const errorResponse = createErrorResponse({ msg: 'Invalid message format' })
    return cb(errorResponse)
  }

  try {
    switch (request.c) {
      case CommandCode.HEARTBEAT:
        return cb(onReceiveHeartbeat())

      case CommandCode.START:
        return cb(await onReceiveStart(request.d))

      case CommandCode.STOP:
        return cb(await onReceiveStop(request.d))

      default:
        return cb(createErrorResponse({ msg: 'Unknown command' }))
    }
  }
  catch (error: any) {
    console.error('处理指令时发生错误:', error)
    return cb(createErrorResponse({ msg: error.message || 'Failed to execute command' }))
  }
}

async function main() {
  // 获取配置管理器
  const configManager = getConfigManager()

  // 初始化日志管理器
  const loggingConfig = configManager.getLoggingConfig()
  const logger = getLogger({
    level: parseLogLevel(loggingConfig.level),
    enableDevicePrefix: loggingConfig.enableDevicePrefix,
    enableTimestamp: true,
  })

  // 验证配置
  const validation = configManager.validate()
  if (!validation.valid) {
    logger.error('Main', '配置验证失败:')
    validation.errors.forEach(error => logger.error('Main', `  - ${error}`))
    process.exit(1)
  }

  // 获取设备配置
  const deviceConfigs = configManager.getDeviceConfigs()
  if (deviceConfigs.length === 0) {
    logger.error('Main', '没有启用的设备配置')
    process.exit(1)
  }

  logger.info('Main', `加载了 ${deviceConfigs.length} 个设备配置:`)
  deviceConfigs.forEach((device) => {
    logger.info('Main', `  - ${device.deviceId}: ${device.serialPath}`)
  })

  deviceManager = new DeviceManager(deviceConfigs)

  // 根据配置创建传输层
  const transportConfig = configManager.getTransportConfig()

  if (transportConfig.type === 'http') {
    transport = new HttpTransport(transportConfig.port)
    logger.info('Main', `使用 HTTP 传输层，端口: ${transportConfig.port}`)
  }
  else if (transportConfig.type === 'serial') {
    transport = new SerialTransport(transportConfig)
    logger.info('Main', `使用串口传输层，端口: ${transportConfig.serialPath}`)
  }
  else {
    logger.error('Main', '不支持的传输层类型:', (transportConfig as any).type)
    process.exit(1)
  }

  // 监听来自传输层的指令
  transport.on('data', (message, cb) => {
    handleMessage(message, cb)
  })

  // 监听设备管理器的设备事件，并通过传输层上报
  deviceManager.on('device', (device) => {
    logger.info('Main', '设备上报:', device)
    const event = createDeviceEvent(device as Record<string, unknown>)
    transport?.send(event)
  })

  // 监听设备连接事件
  deviceManager.on('deviceConnected', (info) => {
    logger.info('Main', `设备 ${info.deviceId} (${info.serialPath}) 连接成功`)
  })

  // 监听设备断开连接事件
  deviceManager.on('deviceDisconnected', (info) => {
    logger.warn('Main', `设备 ${info.deviceId} (${info.serialPath}) 断开连接`)
  })

  // 监听设备错误事件
  deviceManager.on('deviceError', (error) => {
    logger.error('Main', `设备 ${error.deviceId} (${error.serialPath}) 发生错误:`, error.error)
  })

  try {
    await transport.start()
    logger.info('Main', '传输层启动成功')

    await deviceManager.initializeDevices()
    const stats = deviceManager.getConnectionStats()
    logger.info('Main', `设备初始化完成: ${stats.connected}/${stats.total} 个设备连接成功`)

    if (stats.reconnecting > 0) {
      logger.info('Main', `${stats.reconnecting} 个设备正在重连中`)
    }

    if (stats.connected === 0 && stats.reconnecting === 0) {
      logger.error('Main', '没有设备连接成功，程序退出')
      process.exit(1)
    }
  }
  catch (error) {
    logger.error('Main', '启动失败:', error)
    process.exit(1)
  }
}

/**
 * 处理心跳指令
 * @returns 心跳响应
 */
function onReceiveHeartbeat() {
  const logger = getLogger()
  logger.debug('Main', '收到心跳指令')
  return createStatusResponse({
    run: true,
  })
}

/**
 * 处理启动扫描指令
 * @param requestData 请求数据
 * @returns 启动扫描响应
 */
async function onReceiveStart(requestData: unknown) {
  const logger = getLogger()
  const data = parseRequestData(requestData)
  const rssi = data?.rssi || '-60'
  const deviceId = data?.did

  logger.info('Main', '收到启动扫描指令', { rssi, deviceId })

  try {
    await deviceManager?.startScan(rssi, deviceId)
    const message = deviceId
      ? `设备 ${deviceId} 开始扫描`
      : '所有设备开始扫描'
    logger.info('Main', message)
    return createStatusResponse({ msg: message })
  }
  catch (error: any) {
    logger.error('Main', '启动扫描失败:', error)
    return createErrorResponse({ msg: error.message || 'Failed to start scan' })
  }
}

/**
 * 处理停止扫描指令
 * @param requestData 请求数据
 * @returns 停止扫描响应
 */
async function onReceiveStop(requestData: unknown) {
  const logger = getLogger()
  const data = parseRequestData(requestData)
  const deviceId = data?.did

  logger.info('Main', '收到停止扫描指令', { deviceId })

  try {
    await deviceManager?.stopScan(deviceId)
    const message = deviceId
      ? `设备 ${deviceId} 停止扫描`
      : '所有设备停止扫描'
    logger.info('Main', message)
    return createStatusResponse({ msg: message })
  }
  catch (error: any) {
    logger.error('Main', '停止扫描失败:', error)
    return createErrorResponse({ msg: error.message || 'Failed to stop scan' })
  }
}

process.on('SIGINT', async () => {
  const logger = getLogger()
  logger.info('Main', '\n正在关闭程序...')
  try {
    await deviceManager?.disconnectAll()
    await transport?.stop()
    logger.info('Main', '程序已安全关闭')
  }
  catch (error) {
    logger.error('Main', '关闭程序时发生错误:', error)
  }
  process.exit()
})

main()
