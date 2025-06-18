const process = require('process')
const { SerialPort } = require('serialport')

let port = null

function main() {
  port = new SerialPort({
    path: '/dev/ttyS3',
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    timeout: 5000,
  })

  port.on('open', () => {
    console.log('open')
  })

  port.on('data', (data) => {
    console.log('data', data)
  })

  setTimeout(() => {
    port.write('1234567890')
  }, 5000)
}

main()

process.on('SIGINT', () => {
  port.close()
  process.exit(0)
})
