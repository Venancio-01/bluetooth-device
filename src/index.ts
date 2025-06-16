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
  console.log('\n正在关闭程序...')
  blueDevice?.disconnect()
  process.exit()
})

main()
