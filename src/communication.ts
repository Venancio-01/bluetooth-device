import { z } from 'zod'

// 1. 编码字典

// 命令码 (上位机 -> 程序)
export const CommandCode = {
  START: 1,
  HEARTBEAT: 2,
  STOP: 3,
} as const

// 事件/响应码 (程序 -> 上位机)
export const EventTypeCode = {
  STATUS: 1,
  ERROR: 2,
  DEVICE: 3,
} as const

// 2. 通信格式定义

// 请求格式 (上位机 -> 程序)
const RequestSchema = z.object({
  c: z.nativeEnum(CommandCode),
  d: z.record(z.unknown()).optional(),
})

// 扩展的请求数据格式，支持设备标识
export const RequestDataSchema = z.object({
  rssi: z.string().optional(),
  did: z.string().optional(), // 设备ID，用于指定特定设备
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
 * @param data 负载数据
 */
export function createErrorResponse(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.ERROR,
    d: data,
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
    d: {
      ...data,
      // 确保设备标识字段使用缩写
      did: data['deviceId'] || data['did'],
      sp: data['serialPath'] || data['sp'],
    },
  }
  // 移除原始的完整字段名，只保留缩写
  if (payload.d['deviceId']) delete payload.d['deviceId']
  if (payload.d['serialPath']) delete payload.d['serialPath']

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
    console.error('Invalid message format:', validation.error)
    return null
  }
  catch (error) {
    console.error('Failed to parse JSON message:', error)
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
    console.error('Invalid request data format:', validation.error)
    return null
  }
  catch (error) {
    console.error('Failed to parse request data:', error)
    return null
  }
}
