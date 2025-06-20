const process = require('process')
const { SerialPort } = require('serialport')

const AT_COMMAND_SUFFIX = '\r\n' // 所有 AT 命令都必须以回车换行符结尾
const AT_COMMAND_PREFIX = 'AT' // 所有 AT 命令都必须以 AT 开头
const AT_COMMAND_MODE = '+++' // 进入AT命令模式,无需回车换行符

const AT_RESTART = 'RESTART'
const AT_SET_ROLE = 'ROLE=1'
const AT_GET_ROLE = 'ROLE?'
const AT_START_OBSERVER = 'OBSERVER=1,4,,,'
const AT_STOP_OBSERVER = 'OBSERVER=0'

/**
 * 进入AT命令模式
 */
export function buildEnterCommandMode() {
  return `${AT_COMMAND_MODE}`
}

/**
 * 重启设备
 */
export function buildRestartCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_RESTART}${AT_COMMAND_SUFFIX}`
}

/**
 * 设置设备为单主角色
 */
export function buildSetRoleCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_SET_ROLE}${AT_COMMAND_SUFFIX}`
}

/**
 * 获取设备角色
 */
export function buildQueryRoleCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_GET_ROLE}${AT_COMMAND_SUFFIX}`
}

/**
 * 获取设备角色
 */
export function parseQueryRoleCommand(data) {
  return data.split('=')[1]
}

/**
 * 设置设备为观察者模式
 */
export function buildObserverCommand(rssi) {
  return `${AT_COMMAND_PREFIX}+${AT_START_OBSERVER}${rssi}${AT_COMMAND_SUFFIX}`
}

/**
 * 停止观察者模式
 */
export function buildStopObserverCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_STOP_OBSERVER}${AT_COMMAND_SUFFIX}`
}

let port = null

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 发送数据并等待
 * @param data 数据
 * @param sleepTime 等待时间
 */
async function sendAndSleep(data, sleepTime = 0) {
  try {
    await port.write(data)
    if (sleepTime > 0) {
      await sleep(sleepTime)
    }
  }
  catch (error) {
    console.error('sendAndSleep', error)
  }
}

async function init() {
  // 重启设备
  await sendAndSleep(buildRestartCommand(), 3000)

  // 进入AT命令模式
  await sendAndSleep(buildEnterCommandMode(), 500)

  // 设置设备为单主角色
  await sendAndSleep(buildSetRoleCommand(), 500)

  // 重启设备
  await sendAndSleep(buildRestartCommand(), 2000)

  // 进入AT命令模式
  await sendAndSleep(buildEnterCommandMode(), 1000)

  // 设置设备为观察者模式
  await sendAndSleep(buildObserverCommand('-53'), 500)
}

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
    init()
  })

  port.on('data', (data) => {
    console.log('data', data)
  })

  setTimeout(() => {
    port.write('1234567890')
    console.log('write')
  }, 5000)
}

main()

process.on('SIGINT', () => {
  port.close()
  process.exit(0)
})
