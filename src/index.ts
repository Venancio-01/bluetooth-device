import type { ITransport, ResponseCallback } from './transport'
import process from 'process'
import { BlueDevice } from './blue-device'
import {
  CommandCode,
  createDeviceEvent,
  createErrorResponse,
  createStatusResponse,
  parseJSONMessage,
} from './communication'
import { HttpTransport } from './http-transport'

let blueDevice: BlueDevice | null = null
let transport: ITransport | null = null

/**
 * 处理来自传输层的消息
 * @param message JSON 字符串消息
 * @param cb      响应回调
 */
function handleMessage(message: string, cb: ResponseCallback) {
  const request = parseJSONMessage(message)
  if (!request) {
    const errorResponse = createErrorResponse({ msg: 'Invalid message format' })
    return cb(errorResponse)
  }

  switch (request.c) {
    case CommandCode.HEARTBEAT:
      console.log('收到心跳指令')
      return cb(createStatusResponse({ run: true }))

    case CommandCode.START:
      console.log('收到启动扫描指令')
      blueDevice?.startScan()
      return cb(createStatusResponse({ msg: 'Scan started' }))

    case CommandCode.STOP:
      console.log('收到停止扫描指令')
      blueDevice?.stopScan()
      return cb(createStatusResponse({ msg: 'Scan stopped' }))

    default:
      return cb(createErrorResponse({ msg: 'Unknown command' }))
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

process.on('SIGINT', () => {
  console.log('\n正在关闭程序...')
  blueDevice?.disconnect()
  transport?.stop()
  process.exit()
})

main()
