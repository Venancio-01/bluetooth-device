import { EventEmitter } from 'events'
import { ReadlineParser } from '@serialport/parser-readline'
import { SerialPort } from 'serialport'
import { buildEnterCommandMode, buildObserverCommand, buildRestartCommand, buildSetRoleCommand, buildStopObserverCommand } from './protocol'
import { sleep } from './utils'

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

export class BlueDevice extends EventEmitter {
  private port: SerialPort | null = null
  private initializeState: 'uninitialized' | 'initializing' | 'initialized' = 'uninitialized'
  private isScanning = false
  private deleteDeviceList: Set<string> = new Set()
  private readonly serialPath: string
  private readonly deviceId: string

  constructor(serialPath: string = '/dev/ttyUSB0', deviceId?: string) {
    super()
    this.port = null
    this.serialPath = serialPath
    this.deviceId = deviceId || serialPath.replace(/[^a-z0-9]/gi, '_')
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
        console.error(`[${this.deviceId}] 串口错误:`, err)
        this.emit('error', err)
        reject(err)
      })

      this.port.on('close', () => {
        console.warn(`[${this.deviceId}] 串口连接关闭`)
        this.emit('disconnected', { deviceId: this.deviceId, serialPath: this.serialPath })
        reject(new Error('串口关闭'))
      })

      parser.on('data', (data) => {
        console.log(`[${this.deviceId}] 接收数据:`, data)
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
    console.log(`[${this.deviceId}] 发送数据:`, data)
    return new Promise<void>((resolve, reject) => {
      if (!this.port) {
        const error = new Error('串口未连接')
        console.error(`[${this.deviceId}] 发送数据失败:`, error.message)
        this.emit('error', error)
        reject(error)
        return
      }

      this.port.write(data, (err) => {
        if (err) {
          console.error(`[${this.deviceId}] 发送数据时出错:`, err.message)
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

    if (splitStr === 'FF') {
      const targetStr = advStr.substring(splitStrIndex + 4, splitStrIndex + 6) + advStr.substring(splitStrIndex + 2, splitStrIndex + 4)
      const manufacturer = MANUFACTURER_DICT[targetStr as keyof typeof MANUFACTURER_DICT]
      if (manufacturer) {
        const hasDevice = this.deleteDeviceList.has(targetStr)

        if (!hasDevice) {
          console.log(`[${this.deviceId}] manufacturer`, manufacturer)
          this.emit('device', {
            mf: manufacturer,
          })
          this.deleteDeviceList.add(targetStr)
        }
      }
    }
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
      console.error(`[${this.deviceId}] 发送指令失败:`, error)
      throw error
    }
  }

  async initialize() {
    if (this.initializeState === 'initializing' || this.initializeState === 'initialized') {
      return
    }

    console.log(`[${this.deviceId}] 开始初始化设备`)
    this.initializeState = 'initializing'

    try {
      // 重启设备
      await this.sendAndSleep(buildRestartCommand(), 1000)

      // 进入AT命令模式
      await this.sendAndSleep(buildEnterCommandMode(), 1000)

      // 设置设备为单主角色
      await this.sendAndSleep(buildSetRoleCommand(), 1000)

      // 重启设备
      await this.sendAndSleep(buildRestartCommand(), 3000)

      // 进入AT命令模式
      await this.sendAndSleep(buildEnterCommandMode(), 2000)

      this.initializeState = 'initialized'
      console.log(`[${this.deviceId}] 设备初始化完成`)
    }
    catch (error) {
      this.initializeState = 'uninitialized'
      console.error(`[${this.deviceId}] 设备初始化失败:`, error)
      this.emit('error', error)
      throw error
    }
  }

  async startScan(rssi = '-60') {
    try {
      if (this.initializeState === 'uninitialized') {
        await this.initialize()
      }

      if (this.initializeState === 'initializing') {
        console.log(`[${this.deviceId}] 设备初始化中，请稍后再试`)
        throw new Error('设备初始化中')
      }

      if (this.isScanning) {
        console.log(`[${this.deviceId}] 设备已在扫描中`)
        return
      }

      console.log(`[${this.deviceId}] 开始扫描，RSSI阈值: ${rssi}`)
      this.deleteDeviceList.clear()
      this.isScanning = true

      // 设置设备为观察者模式
      await this.sendAndSleep(buildObserverCommand(rssi))
      console.log(`[${this.deviceId}] 扫描已启动`)
    }
    catch (error) {
      this.isScanning = false
      console.error(`[${this.deviceId}] 启动扫描失败:`, error)
      this.emit('error', error)
      throw error
    }
  }

  async stopScan() {
    try {
      if (!this.isScanning) {
        console.log(`[${this.deviceId}] 设备未在扫描中`)
        return
      }

      console.log(`[${this.deviceId}] 停止扫描`)
      // 停止扫描
      await this.sendAndSleep(buildStopObserverCommand())
      this.isScanning = false
      console.log(`[${this.deviceId}] 扫描已停止`)
    }
    catch (error) {
      console.error(`[${this.deviceId}] 停止扫描失败:`, error)
      this.emit('error', error)
      throw error
    }
  }

  /**
   * 重启设备
   */
  async restart() {
    await this.sendAndSleep(buildRestartCommand())
  }
}
