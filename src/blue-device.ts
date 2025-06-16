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

export class BlueDevice {
  private port: SerialPort | null = null
  private isInitialized = false

  constructor() {
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
        console.log(data)
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

    const splitStr = advStr.substring(14, 16)

    if (splitStr === 'FF') {
      const targetStr = advStr.substring(18, 20) + advStr.substring(16, 18)
      const manufacturer = MANUFACTURER_DICT[targetStr as keyof typeof MANUFACTURER_DICT]
      console.log(manufacturer)
    }
  }

  async sendAndSleep(data: string, sleepTime: number) {
    await this.send(data)
    await sleep(sleepTime)
  }

  async initialize() {
    if (this.isInitialized) {
      return
    }

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

    this.isInitialized = true
  }

  async scan() {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // 设置设备为观察者模式
    await this.sendAndSleep(buildObserverCommand(), 0)
  }
}
