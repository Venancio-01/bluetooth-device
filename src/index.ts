import type { ITransport, ResponseCallback } from './transport'
import process from 'process'
import {
  CommandCode,
  createDeviceEvent,
  createErrorResponse,
  createHeartbeatEvent,
  createSimpleErrorResponse,
  createStatusResponse,
  ErrorCode,
  parseRequestData,
} from './communication'
import { getConfigManager } from './config'
import { DeviceManager } from './device-manager'
import { HttpTransport } from './http-transport'
import { getLogger, parseLogLevel } from './logger'
import { SerialTransport } from './serial-transport'

let deviceManager: DeviceManager | null = null
let transport: ITransport | null = null
let heartbeatTimer: NodeJS.Timeout | null = null

/**
 * 处理来自传输层的消息
 * @param message JSON 字符串消息
 * @param cb      响应回调
 */
async function handleMessage(message: any, cb: ResponseCallback) {
  const request = message
  if (!request) {
    const errorResponse = createErrorResponse({
      code: ErrorCode.INVALID_MESSAGE_FORMAT,
      message: 'Invalid message format',
      suggestion: 'Please check the message format and ensure it follows the protocol specification',
    })
    return cb(errorResponse)
  }

  try {
    switch (request.c) {
      case CommandCode.START || '1':
        return cb(await onReceiveStart(request.d))

      case CommandCode.STOP || '2':
        return cb(await onReceiveStop())

      default:
        return cb(createErrorResponse({
          code: ErrorCode.UNKNOWN_COMMAND,
          message: 'Unknown command',
          suggestion: 'Please check the command code and ensure it is supported',
          context: { receivedCommand: request.c },
        }))
    }
  }
  catch (error: any) {
    console.error('处理指令时发生错误:', error)
    return cb(createErrorResponse({
      code: ErrorCode.COMMAND_EXECUTION_FAILED,
      message: error.message || 'Failed to execute command',
      suggestion: 'Please check the device status and try again',
      context: { command: request.c, error: error.message },
    }))
  }
}

/**
 * 启动心跳定时器
 */
function startHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
  }

  heartbeatTimer = setInterval(() => {
    if (transport && deviceManager) {
      const stats = deviceManager.getConnectionStats()
      const heartbeatData = createHeartbeatEvent({
        run: stats.connected > 0,
      })
      transport.send(heartbeatData)
    }
  }, 2000) // 每2秒发送一次心跳
}

/**
 * 停止心跳定时器
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
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

    // 启动心跳定时器
    startHeartbeat()
    logger.info('Main', '心跳定时器已启动')
  }
  catch (error) {
    logger.error('Main', '启动失败:', error)
    process.exit(1)
  }
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

  logger.info('Main', '收到启动扫描指令', { rssi })

  try {
    await deviceManager?.startScan(rssi)
    logger.info('Main', '所有设备开始扫描')
    return createStatusResponse({ msg: 'Scan started' })
  }
  catch (error: any) {
    logger.error('Main', '启动扫描失败:', error)
    return createErrorResponse({
      code: ErrorCode.SCAN_START_FAILED,
      message: error.message || 'Failed to start scan',
      suggestion: 'Please check device connections and try again',
      context: { rssi, error: error.message },
    })
  }
}

/**
 * 处理停止扫描指令
 * @returns 停止扫描响应
 */
async function onReceiveStop() {
  const logger = getLogger()

  try {
    await deviceManager?.stopScan()
    logger.info('Main', '所有设备停止扫描')
    return createStatusResponse({ msg: 'Scan stopped' })
  }
  catch (error: any) {
    logger.error('Main', '停止扫描失败:', error)
    return createErrorResponse({
      code: ErrorCode.SCAN_STOP_FAILED,
      message: error.message || 'Failed to stop scan',
      suggestion: 'Please check device connections and try again',
      context: { error: error.message },
    })
  }
}

process.on('SIGINT', async () => {
  const logger = getLogger()
  logger.info('Main', '\n正在关闭程序...')
  try {
    stopHeartbeat()
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
