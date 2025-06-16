const AT_COMMAND_SUFFIX = '\r\n' // 所有 AT 命令都必须以回车换行符结尾
const AT_COMMAND_PREFIX = 'AT' // 所有 AT 命令都必须以 AT 开头
const AT_COMMAND_MODE = '+++' // 进入AT命令模式,无需回车换行符

const AT_RESTART = 'RESTART'
const AT_ROLE = 'ROLE=1'
const AT_OBSERVER = 'OBSERVER=1,4,,,'

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
 * 设置设备为从机模式
 */
export function buildRoleCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_ROLE}${AT_COMMAND_SUFFIX}`
}

/**
 * 设置设备为观察者模式
 */
export function buildObserverCommand(rssi = 60) {
  const defaultRssi = `-${rssi}`
  return `${AT_COMMAND_PREFIX}+${AT_OBSERVER}${defaultRssi}${AT_COMMAND_SUFFIX}`
}
