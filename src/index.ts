import process from 'process'
import { BlueDevice } from './blue-device'

let blueDevice: BlueDevice | null = null

async function main() {
  blueDevice = new BlueDevice()

  try {
    await blueDevice.connect()
    console.log('蓝牙模块连接成功')
  }
  catch (error) {
    console.error(error)
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
  console.log('\n检测到 SIGINT，正在关闭串口...')
  blueDevice?.disconnect()
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
