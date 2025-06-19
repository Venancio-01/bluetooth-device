import { EventEmitter } from 'events'
import { ReadlineParser } from '@serialport/parser-readline'
import { SerialPort } from 'serialport'
import { getLogger } from './logger'
import { buildEnterCommandMode, buildObserverCommand, buildRestartCommand, buildSetRoleCommand, buildStopObserverCommand } from './protocol'
import { sleep } from './utils'

const logger = getLogger()

// 厂商字典
const MANUFACTURER_DICT = {
  '0001': 'Nokia Mobile Phones',
  // '0006': 'Microsoft',
  '0008': 'Motorola',
  '004C': 'Apple, Inc.',
  '0056': 'Sony Ericsson Mobile Communications',
  '0075': 'Samsung Electronics Co. Ltd.',
  '00C4': 'LG Electronics',
  '00EO': 'Google',
} as const

interface DetectionResult {
  mf: string
  timestamp: number
}

export class BlueDevice extends EventEmitter {
  private port: SerialPort | null = null
  private initializeState: 'uninitialized' | 'initializing' | 'initialized' = 'uninitialized'
  private isScanning = false
  private deleteDeviceList: Set<string> = new Set()
  private readonly serialPath: string
  private readonly deviceId: string
  private readonly reportInterval: number
  private reportTimer: NodeJS.Timeout | null = null
  private enableReport = false
  // 检测结果列表
  private detectionResultList: DetectionResult[] = []

  constructor(serialPath: string = '/dev/ttyUSB0', deviceId?: string, reportInterval: number = 5000) {
    super()
    this.port = null
    this.serialPath = serialPath
    this.deviceId = deviceId || serialPath.replace(/[^a-z0-9]/gi, '_')
    this.reportInterval = reportInterval
  }

  /**
   * 获取设备ID
   */
  getDeviceId(): string {
    return this.deviceId
  }

  /**
   * 获取串口路径
   */
  getSerialPath(): string {
    return this.serialPath
  }

  /**
   * 获取设备状态
   */
  getStatus() {
    return {
      deviceId: this.deviceId,
      serialPath: this.serialPath,
      connected: this.port !== null,
      initializeState: this.initializeState,
      isScanning: this.isScanning,
    }
  }

  /**
   * 检查是否正在扫描
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.serialPath,
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false,
      }, (err) => {
        if (err) {
          reject(err)
        }
      })

      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

      this.port.on('open', () => {
        resolve(this.port)
      })

      this.port.on('error', (err) => {
        logger.error('BlueDevice', `[${this.deviceId}] 串口错误:`, err)
        this.emit('error', err)
        reject(err)
      })

      this.port.on('close', () => {
        logger.warn('BlueDevice', `[${this.deviceId}] 串口连接关闭`)
        this.emit('disconnected', { deviceId: this.deviceId, serialPath: this.serialPath })
        reject(new Error('串口关闭'))
      })

      parser.on('data', (data) => {
        logger.debug('BlueDevice', `[${this.deviceId}] 接收数据:`, data)
        this.parseData(data)
      })

      this.port.open()
    })
  }

  async disconnect() {
    await this.stopScan()
    this.port?.close()
  }

  async send(data: string) {
    logger.debug('BlueDevice', `[${this.deviceId}] 发送数据:`, data)
    return new Promise<void>((resolve, reject) => {
      if (!this.port) {
        const error = new Error('串口未连接')
        logger.error('BlueDevice', `[${this.deviceId}] 发送数据失败:`, error.message)
        this.emit('error', error)
        reject(error)
        return
      }

      this.port.write(data, (err) => {
        if (err) {
          logger.error('BlueDevice', `[${this.deviceId}] 发送数据时出错:`, err.message)
          this.emit('error', err)
          reject(err)
        }
        else {
          resolve()
        }
      })
    })
  }

  async parseData(data: string) {
    const advStr = data.split(',')?.[2]?.split(':')?.[1]

    if (!advStr) {
      return
    }

    const splitStrIndex = advStr.indexOf('FF')
    const splitStr = advStr.substring(splitStrIndex, splitStrIndex + 2)

    if (splitStr !== 'FF') return

    const targetStr = advStr.substring(splitStrIndex + 4, splitStrIndex + 6) + advStr.substring(splitStrIndex + 2, splitStrIndex + 4)
    const manufacturer = MANUFACTURER_DICT[targetStr as keyof typeof MANUFACTURER_DICT]
    // 如果厂商不存在，则不处理
    if (!manufacturer) return

    // 添加检测结果
    this.addDetectionResult({
      mf: manufacturer,
      timestamp: Date.now(),
    })

    const hasDevice = this.deleteDeviceList.has(targetStr)
    // 如果设备已被检测，则不处理
    if (hasDevice) return

    // 如果未开启上报，则不处理
    if (!this.enableReport) return

    this.emit('device', {
      mf: manufacturer,
    })
    this.deleteDeviceList.add(targetStr)
  }

  /**
   * 发送数据并等待
   * @param data 数据
   * @param sleepTime 等待时间
   */
  async sendAndSleep(data: string, sleepTime = 0) {
    try {
      await this.send(data)
      if (sleepTime > 0) {
        await sleep(sleepTime)
      }
    }
    catch (error) {
      logger.error('BlueDevice', `[${this.deviceId}] 发送指令失败:`, error)
      throw error
    }
  }

  async initialize() {
    if (this.initializeState === 'initializing' || this.initializeState === 'initialized') {
      return
    }

    logger.info('BlueDevice', `[${this.deviceId}] 开始初始化设备`)
    this.initializeState = 'initializing'

    try {
      // 重启设备
      await this.sendAndSleep(buildRestartCommand(), 3000)

      // 进入AT命令模式
      await this.sendAndSleep(buildEnterCommandMode(), 500)

      // 设置设备为单主角色
      await this.sendAndSleep(buildSetRoleCommand(), 500)

      // 重启设备
      await this.sendAndSleep(buildRestartCommand(), 2000)

      // 进入AT命令模式
      await this.sendAndSleep(buildEnterCommandMode(), 1000)

      this.initializeState = 'initialized'

      // 开始扫描
      await this.startScan()

      logger.info('BlueDevice', `[${this.deviceId}] 设备初始化完成`)
    }
    catch (error) {
      this.initializeState = 'uninitialized'
      logger.error('BlueDevice', `[${this.deviceId}] 设备初始化失败:`, error)
      this.emit('error', error)
      throw error
    }
  }

  async startScan(rssi = '-50') {
    try {
      if (this.initializeState === 'uninitialized') {
        await this.initialize()
      }

      if (this.initializeState === 'initializing') {
        logger.error('BlueDevice', `[${this.deviceId}] 设备初始化中，请稍后再试`)
        throw new Error('设备初始化中')
      }

      if (this.isScanning) {
        logger.info('BlueDevice', `[${this.deviceId}] 设备已在扫描中`)
        return
      }

      logger.info('BlueDevice', `[${this.deviceId}] 开始扫描，RSSI阈值: ${rssi}`)
      this.isScanning = true
      // 启动定时清除已检测设备
      this.startReportTimer()

      // 设置设备为观察者模式
      await this.sendAndSleep(buildObserverCommand(rssi))
      logger.info('BlueDevice', `[${this.deviceId}] 扫描已启动`)
    }
    catch (error) {
      this.isScanning = false
      logger.error('BlueDevice', `[${this.deviceId}] 启动扫描失败:`, error)
      this.emit('error', error)
      throw error
    }
  }

  async stopScan() {
    try {
      if (!this.isScanning) {
        logger.info('BlueDevice', `[${this.deviceId}] 设备未在扫描中`)
        return
      }

      logger.info('BlueDevice', `[${this.deviceId}] 停止扫描`)
      // 停止扫描
      await this.sendAndSleep(buildStopObserverCommand())
      this.isScanning = false
      logger.info('BlueDevice', `[${this.deviceId}] 扫描已停止`)
      // 停止定时清除已检测设备
      this.stopReportTimer()
    }
    catch (error) {
      logger.error('BlueDevice', `[${this.deviceId}] 停止扫描失败:`, error)
      this.emit('error', error)
      throw error
    }
  }

  async startReport() {
    this.enableReport = true
    const manufacturer = [...new Set(this.detectionResultList.map(item => item.mf))].join(',')
    if (!manufacturer) return
    logger.info('BlueDevice', `[${this.deviceId}] 缓冲区检测结果:`, manufacturer)

    this.emit('device', {
      mf: manufacturer,
    })
  }

  async stopReport() {
    this.enableReport = false
  }

  addDetectionResult(result: DetectionResult) {
    // 最大保留时间
    const maxRetentionTime = 1000
    // 删除过期数据
    this.detectionResultList = this.detectionResultList.filter(item => Date.now() - item.timestamp < maxRetentionTime)
    // 添加新数据
    this.detectionResultList.push(result)
  }

  /**
   * 重启设备
   */
  async restart() {
    await this.sendAndSleep(buildRestartCommand())
  }

  // 启动定时清除已检测设备
  private startReportTimer() {
    this.deleteDeviceList.clear()
    this.reportTimer = setInterval(() => {
      this.deleteDeviceList.clear()
    }, this.reportInterval)
  }

  // 停止定时清除已检测设备
  private stopReportTimer() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
      this.reportTimer = null
    }
  }
}
