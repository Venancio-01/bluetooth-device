import process from 'process'
import { ReadlineParser } from '@serialport/parser-readline'
import { SerialPort } from 'serialport'

const SERIAL_PORT_PATH = '/dev/ttyUSB0'
const BAUD_RATE = 115200

const AT_COMMAND_SUFFIX = '\r\n' // 所有 AT 命令都必须以回车换行符结尾

let port: SerialPort | null = null

function openSerialPort() {
  port = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false,
  }, (err) => {
    if (err) {
      return console.error('打开串口时出错:', err.message)
    }
    console.log(`串口 ${SERIAL_PORT_PATH} 以 ${BAUD_RATE} 波特率打开成功！`)
  })

  const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

  // 串口打开事件
  port.on('open', () => {
    console.log('串口已成功打开。')
  })

  // 监听数据接收事件
  parser.on('data', (data) => {
    console.log('收到数据:', data)
  })

  // 监听错误事件
  port.on('error', (err) => {
    console.error('串口错误:', err.message)
  })

  // 监听串口关闭事件
  port.on('close', () => {
    console.log('串口已关闭')
  })

  // 打开串口
  port.open()
}

function sendData(data: string, newline = true) {
  if (port && port.isOpen) {
    port.write(data + (newline ? AT_COMMAND_SUFFIX : ''), (err) => {
      if (err) {
        return console.error('发送数据时出错:', err.message)
      }
      console.log('数据发送成功:', data)
    })
  }
  else {
    console.warn('串口未打开，无法发送数据。')
  }
}

function closeSerialPort() {
  if (port && port.isOpen) {
    port.close((err) => {
      if (err) {
        console.error('关闭串口时出错:', err.message)
      }
      else {
        console.log('串口已成功关闭。')
      }
    })
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  openSerialPort()

  await sleep(2000)

  await sendAndSleep('AT+RESTART', 1000)

  await sendAndSleep('+++', 1000, false)

  await sendAndSleep('AT+ROLE=1', 1000)

  await sendAndSleep('AT+RESTART', 3000)

  await sendAndSleep('+++', 2000, false)

  await sendAndSleep('AT+OBSERVER=1,12,,,-60,4C00', 0)
}

async function sendAndSleep(data: string, sleepTime: number, newline = true) {
  sendData(data, newline)
  await sleep(sleepTime)
}

process.on('SIGINT', () => {
  console.log('\n检测到 SIGINT，正在关闭串口...')
  closeSerialPort()
  process.exit()
})

main()

// function parseData(data: string) {
//   const demo = 'MAC:45:57:BC:FB:0F:09,RSSI:-87,ADV:02011A020A0C0AFF4C0010051A18A0D043'
//   const adv = demo.split(',')[2].split(':')[1]

//   const splitAdv = adv.substring(14, 16)

//   if (splitAdv === 'FF') {
//     const targetStr = adv.substring(18, 20) + adv.substring(16, 18)
//     console.log(targetStr)
//   }
// }

// parseData('02 01 1A 02 0A 0C 0A FF 4C0010051A18A0D043')
