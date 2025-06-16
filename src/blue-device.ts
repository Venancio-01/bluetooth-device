import { EventEmitter } from 'events'
import { ReadlineParser } from '@serialport/parser-readline'
import { SerialPort } from 'serialport'
import { buildEnterCommandMode, buildObserverCommand, buildRestartCommand, buildRoleCommand } from './protocol'
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

  constructor() {
    super()
    this.port = null
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: '/dev/ttyUSB0',
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
        reject(err)
      })

      this.port.on('close', () => {
        reject(new Error('串口关闭'))
      })

      parser.on('data', (data) => {
        console.log('接收数据:', data)
        this.parseData(data)
      })

      this.port.open()
    })
  }

  async disconnect() {
    this.port?.close()
  }

  async send(data: string) {
    console.log('发送数据:', data)
    this.port?.write(data, (err) => {
      if (err) {
        console.error('发送数据时出错:', err.message)
      }
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
        console.log('manufacturer', manufacturer)
        this.emit('device', { mf: manufacturer })
      }
    }
  }

  async sendAndSleep(data: string, sleepTime: number) {
    await this.send(data)
    await sleep(sleepTime)
    this.initializeState = 'initialized'
  }

  async initialize() {
    if (this.initializeState === 'initializing' || this.initializeState === 'initialized') {
      return
    }

    this.initializeState = 'initializing'

    // 重启设备
    await this.sendAndSleep(buildRestartCommand(), 1000)

    // 进入AT命令模式
    await this.sendAndSleep(buildEnterCommandMode(), 1000)

    // 设置设备为从机模式
    await this.sendAndSleep(buildRoleCommand(), 1000)

    // 重启设备
    await this.sendAndSleep(buildRestartCommand(), 3000)

    // 进入AT命令模式
    await this.sendAndSleep(buildEnterCommandMode(), 2000)

    this.initializeState = 'initialized'
  }

  async startScan(rssi = 60) {
    if (this.initializeState === 'uninitialized') {
      await this.initialize()
    }

    if (this.initializeState === 'initializing') {
      console.log('设备初始化中，请稍后再试')
      return
    }
    this.isScanning = true
    // 设置设备为观察者模式
    await this.sendAndSleep(buildObserverCommand(rssi), 0)
  }

  async stopScan() {
    if (!this.isScanning) {
      return
    }
    // 通过重启设备来停止扫描
    await this.sendAndSleep(buildRestartCommand(), 1000)
    this.isScanning = false
  }
}
