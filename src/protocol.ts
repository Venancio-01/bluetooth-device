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
export function parseQueryRoleCommand(data: string) {
  return data.split('=')[1]
}

/**
 * 设置设备为观察者模式
 */
export function buildObserverCommand(rssi: string) {
  return `${AT_COMMAND_PREFIX}+${AT_START_OBSERVER}${rssi}${AT_COMMAND_SUFFIX}`
}

/**
 * 停止观察者模式
 */
export function buildStopObserverCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_STOP_OBSERVER}${AT_COMMAND_SUFFIX}`
}
