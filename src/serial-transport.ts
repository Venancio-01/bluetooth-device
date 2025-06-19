import type { Buffer } from 'buffer'
import type { RequestPayload } from './communication'
import type { SerialTransportConfig } from './config'
import { EventEmitter } from 'events'
import { ReadlineParser } from '@serialport/parser-readline'
import { SerialPort } from 'serialport'
import { parseJSONMessage } from './communication'
import { getLogger } from './logger'

const logger = getLogger()

export type ResponseCallback = (response: string) => void

/**
 * 串口传输层实现
 * 通过串口与上位机进行双向通信
 */
export class SerialTransport extends EventEmitter {
  private port: SerialPort | null = null
  private parser: ReadlineParser | null = null
  private readonly config: SerialTransportConfig
  private isConnected = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private readonly reconnectInterval = 5000 // 重连间隔（毫秒）
  private readonly maxReconnectAttempts = 10
  private reconnectAttempts = 0

  // 事件类型定义
  override on(event: 'data', listener: (data: RequestPayload, cb: ResponseCallback) => void): this
  override on(event: 'error', listener: (error: string, cb: ResponseCallback) => void): this
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }

  constructor(config: SerialTransportConfig) {
    super()
    this.config = config
  }

  /**
   * 启动串口传输层
   */
  start = async (): Promise<void> => {
    logger.info('SerialTransport', `启动串口传输层: ${this.config.serialPath}`)
    await this.connect()
  }

  /**
   * 停止串口传输层
   */
  stop = async (): Promise<void> => {
    logger.info('SerialTransport', '停止串口传输层')

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    await this.disconnect()
  }

  /**
   * 发送数据到上位机
   */
  send = (data: string): void => {
    if (!this.isConnected || !this.port) {
      logger.warn('SerialTransport', '串口未连接，无法发送数据')
      return
    }

    try {
      // 添加换行符确保数据完整传输
      const dataWithNewline = data.endsWith('\r\n') ? data : `${data}\r\n`
      this.port.write(dataWithNewline, (err) => {
        if (err) {
          logger.error('SerialTransport', '发送数据失败:', err)
          this.emit('error', `发送数据失败: ${err.message}`)
        }
        else {
          logger.debug('SerialTransport', '发送数据:', data)
        }
      })
    }
    catch (error) {
      logger.error('SerialTransport', '发送数据异常:', error)
      this.emit('error', `发送数据异常: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 建立串口连接
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.config.serialPath,
          baudRate: this.config.baudRate || 115200,
          dataBits: this.config.dataBits as 5 | 6 | 7 | 8,
          stopBits: this.config.stopBits as 1 | 1.5 | 2,
          parity: this.config.parity || 'none',
          autoOpen: false,
        })

        // 创建数据解析器
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

        // 监听串口打开事件
        this.port.on('open', () => {
          this.isConnected = true
          this.reconnectAttempts = 0
          logger.info('SerialTransport', `串口连接成功: ${this.config.serialPath}`)
          resolve()
        })

        // 监听串口错误事件
        this.port.on('error', (err) => {
          logger.error('SerialTransport', '串口错误:', err)
          this.isConnected = false
          this.emit('error', `串口错误: ${err.message}`)
          reject(err)
        })

        // 监听串口关闭事件
        this.port.on('close', () => {
          logger.warn('SerialTransport', '串口连接关闭')
          this.isConnected = false
          this.scheduleReconnect()
        })

        // 监听数据接收事件
        this.parser.on('data', (data: string) => {
          logger.debug('SerialTransport', '接收解析分隔符后的数据:', data)
          try {
            this.handleReceivedData(data)
          }
          catch (error) {
            logger.error('SerialTransport', '处理接收数据失败:', error)
            this.emit('error', `处理接收数据失败: ${error instanceof Error ? error.message : String(error)}`)
          }
        })

        // 打开串口
        this.port.open()
      }
      catch (error) {
        logger.error('SerialTransport', '创建串口连接失败:', error)
        reject(error)
      }
    })
  }

  /**
   * 断开串口连接
   */
  private async disconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.port && this.isConnected) {
        this.port.close(() => {
          this.isConnected = false
          logger.info('SerialTransport', '串口连接已断开')
          resolve()
        })
      }
      else {
        resolve()
      }
    })
  }

  /**
   * 处理接收到的数据
   */
  private handleReceivedData(data: string): void {
    // 创建响应回调函数
    const responseCallback: ResponseCallback = (response: string) => {
      this.send(response)
    }

    try {
      const requestPayload = parseJSONMessage(data)

      if (!requestPayload) {
        logger.warn('SerialTransport', '接收到的数据格式不正确:', data)
        this.emit('error', `接收到的数据格式不正确: ${data}`, responseCallback)
        return
      }

      // 触发数据事件，传递给业务层处理
      this.emit('data', requestPayload, responseCallback)
    }
    catch (error) {
      logger.error('SerialTransport', '处理接收数据失败:', error)
      this.emit('error', `处理接收数据失败: ${error instanceof Error ? error.message : String(error)}`, responseCallback)
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('SerialTransport', `重连失败，已达到最大重连次数: ${this.maxReconnectAttempts}`)
      return
    }

    if (this.reconnectTimer) {
      return // 已经在重连中
    }

    this.reconnectAttempts++
    logger.info('SerialTransport', `${this.reconnectInterval / 1000}秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.connect()
        logger.info('SerialTransport', '重连成功')
      }
      catch (error) {
        logger.error('SerialTransport', '重连失败:', error)
        this.scheduleReconnect()
      }
    }, this.reconnectInterval)
  }

  /**
   * 获取连接状态
   */
  isConnectedStatus(): boolean {
    return this.isConnected
  }

  /**
   * 获取配置信息
   */
  getConfig(): SerialTransportConfig {
    return { ...this.config }
  }
}
