import type { ITransport, ResponseCallback } from './transport'
import process from 'process'
import { BlueDevice } from './blue-device'
import {
  CommandCode,
  createDeviceEvent,
  createErrorResponse,
  createStatusResponse,
} from './communication'
import { HttpTransport } from './http-transport'

let blueDevice: BlueDevice | null = null
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
        return cb(onReviceHeartbeat())

      case CommandCode.START:
        return cb(await onReviceStart(request.d?.['rssi'] as string | undefined || '-60'))

      case CommandCode.STOP:
        return cb(await onReviceStop())

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
  blueDevice = new BlueDevice()
  transport = new HttpTransport() // 可替换为 new SerialTransport()

  // 监听来自传输层的指令
  transport.on('data', (message, cb) => {
    handleMessage(message, cb)
  })

  // 监听蓝牙设备事件，并通过传输层上报
  blueDevice.on('device', (device) => {
    console.log('设备上报:', device)
    const event = createDeviceEvent(device as Record<string, unknown>)
    transport?.send(event)
  })

  try {
    await blueDevice.connect()
    console.log('蓝牙模块连接成功')
    await transport.start()
  }
  catch (error) {
    console.error(error)
    // 连接失败，直接退出
    process.exit(1)
  }

  try {
    await blueDevice.initialize()
    console.log('蓝牙模块初始化完成')
  }
  catch (error) {
    console.error(error)
  }
}

/**
 * 处理心跳指令
 * @param message 心跳指令
 * @returns 心跳响应
 */
function onReviceHeartbeat() {
  console.log('收到心跳指令')
  return createStatusResponse({ run: true })
}

/**
 * 处理启动扫描指令
 * @param message 启动扫描指令
 * @returns 启动扫描响应
 */
async function onReviceStart(rssi = '-60') {
  console.log('收到启动扫描指令', rssi)
  await blueDevice?.startScan(rssi)
  return createStatusResponse({ msg: 'Scan started' })
}

/**
 * 处理停止扫描指令
 * @returns 停止扫描响应
 */
async function onReviceStop() {
  console.log('收到停止扫描指令')
  await blueDevice?.stopScan()
  return createStatusResponse({ msg: 'Scan stopped' })
}

process.on('SIGINT', () => {
  console.log('\n正在关闭程序...')
  blueDevice?.disconnect()
  transport?.stop()
  process.exit()
})

main()
