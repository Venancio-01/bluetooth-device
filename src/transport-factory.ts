import type { HttpTransportConfig, SerialTransportConfig } from './config'
import type { ITransport } from './transport'
import { HttpTransport } from './http-transport'
import { getLogger } from './logger'
import { SerialTransport } from './serial-transport'

const logger = getLogger()

/**
 * 传输层配置联合类型
 */
export type TransportConfig = HttpTransportConfig | SerialTransportConfig

/**
 * 传输层工厂
 * 负责根据配置创建和初始化不同类型的传输层
 */

/**
 * 根据配置创建传输层实例
 * @param config 传输层配置
 * @returns 传输层实例
 */
export function createTransport(config: TransportConfig): ITransport {
  logger.info('TransportFactory', '正在创建传输层:', config.type)

  switch (config.type) {
    case 'http':
      return createHttpTransport(config)

    case 'serial':
      return createSerialTransport(config)

    default:
      throw new Error(`不支持的传输层类型: ${(config as any).type}`)
  }
}

/**
 * 创建 HTTP 传输层
 * @param config HTTP 传输层配置
 * @returns HTTP 传输层实例
 */
function createHttpTransport(config: HttpTransportConfig): HttpTransport {
  logger.info('TransportFactory', `创建 HTTP 传输层，端口: ${config.port}`)
  return new HttpTransport(config.port)
}

/**
 * 创建串口传输层
 * @param config 串口传输层配置
 * @returns 串口传输层实例
 */
function createSerialTransport(config: SerialTransportConfig): SerialTransport {
  logger.info('TransportFactory', `创建串口传输层，端口: ${config.serialPath}`)
  return new SerialTransport(config)
}

/**
 * 验证传输层配置
 * @param config 传输层配置
 * @returns 验证结果
 */
export function validateTransportConfig(config: TransportConfig): { valid: boolean, errors: string[] } {
  const errors: string[] = []

  if (!config.type) {
    errors.push('传输层类型不能为空')
    return { valid: false, errors }
  }

  switch (config.type) {
    case 'http':
      return validateHttpTransportConfig(config)

    case 'serial':
      return validateSerialTransportConfig(config)

    default:
      errors.push(`不支持的传输层类型: ${(config as any).type}`)
      return { valid: false, errors }
  }
}

/**
 * 验证 HTTP 传输层配置
 * @param config HTTP 传输层配置
 * @returns 验证结果
 */
function validateHttpTransportConfig(config: HttpTransportConfig): { valid: boolean, errors: string[] } {
  const errors: string[] = []

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('HTTP 端口必须在 1-65535 范围内')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 验证串口传输层配置
 * @param config 串口传输层配置
 * @returns 验证结果
 */
function validateSerialTransportConfig(config: SerialTransportConfig): { valid: boolean, errors: string[] } {
  const errors: string[] = []

  if (!config.serialPath) {
    errors.push('串口路径不能为空')
  }

  if (!config.baudRate || config.baudRate <= 0) {
    errors.push('波特率必须大于 0')
  }

  if (config.dataBits && ![5, 6, 7, 8].includes(config.dataBits)) {
    errors.push('数据位必须是 5, 6, 7, 8 中的一个')
  }

  if (config.stopBits && ![1, 2].includes(config.stopBits)) {
    errors.push('停止位必须是 1 或 2')
  }

  if (config.parity && !['none', 'even', 'odd', 'mark', 'space'].includes(config.parity)) {
    errors.push('校验位必须是 none, even, odd, mark, space 中的一个')
  }

  return { valid: errors.length === 0, errors }
}
