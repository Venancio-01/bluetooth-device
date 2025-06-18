import { z } from 'zod'
import { getLogger } from './logger'

const logger = getLogger()

// 1. 编码字典

// 命令码 (上位机 -> 程序)
export const CommandCode = {
  START: 1,
  STOP: 2,
} as const

// 事件/响应码 (程序 -> 上位机)
export const EventTypeCode = {
  STATUS: 1,
  ERROR: 2,
  DEVICE: 3,
  HEARTBEAT: 4,
} as const

// 2. 通信格式定义

// 请求格式 (上位机 -> 程序)
const RequestSchema = z.object({
  c: z.nativeEnum(CommandCode),
  d: z.record(z.unknown()).optional(),
})

// 请求数据格式
export const RequestDataSchema = z.object({
  rssi: z.string().optional(),
}).passthrough() // 允许其他字段通过

// 响应/上报格式 (程序 -> 上位机)
export const ResponseSchema = z.object({
  t: z.nativeEnum(EventTypeCode),
  d: z.record(z.unknown()),
})

export type RequestPayload = z.infer<typeof RequestSchema>
export type ResponsePayload = z.infer<typeof ResponseSchema>
export type RequestData = z.infer<typeof RequestDataSchema>

// 3. 消息创建辅助函数

/**
 * 创建一个标准的状态响应
 * @param data 负载数据
 */
export function createStatusResponse(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.STATUS,
    d: data,
  }
  return JSON.stringify(payload)
}

/**
 * 创建一个标准的错误响应
 * @param message 错误消息
 */
export function createErrorResponse(message: string): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.ERROR,
    d: {
      msg: message,
    },
  }
  return JSON.stringify(payload)
}

/**
 * 创建一个设备上报消息
 * @param data 负载数据
 */
export function createDeviceEvent(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.DEVICE,
    d: data,
  }
  return JSON.stringify(payload)
}

/**
 * 创建一个心跳事件消息
 * @param data 负载数据
 */
export function createHeartbeatEvent(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.HEARTBEAT,
    d: data,
  }
  return JSON.stringify(payload)
}

/**
 * 解析传入的 JSON 消息
 * @param message 字符串消息
 * @returns 解析后的数据或在无效时返回 null
 */
export function parseJSONMessage(message: string): RequestPayload | null {
  try {
    const json = JSON.parse(message)
    const validation = RequestSchema.safeParse(json)
    if (validation.success) {
      return validation.data
    }
    logger.error('parseJSONMessage', 'Invalid message format:', validation.error)
    return null
  }
  catch (error) {
    logger.error('parseJSONMessage', 'Failed to parse JSON message:', error)
    return null
  }
}

/**
 * 解析请求数据部分
 * @param data 请求数据对象
 * @returns 解析后的请求数据或在无效时返回 null
 */
export function parseRequestData(data: unknown): RequestData | null {
  try {
    const validation = RequestDataSchema.safeParse(data)
    if (validation.success) {
      return validation.data
    }
    logger.error('parseRequestData', 'Invalid request data format:', validation.error)
    return null
  }
  catch (error) {
    logger.error('parseRequestData', 'Failed to parse request data:', error)
    return null
  }
}
