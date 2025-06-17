# API 协议规范实现总结

本文档总结了按照 `docs/communication-protocol.md` 文档中定义的通信协议规范实现 API 接口的具体修改内容。

## 修改概览

### 1. 修复协议定义不一致问题

**文件**: `src/communication.ts`

**修改内容**:
- 修正命令码定义，使其与协议文档完全一致：
  - 移除了 `HEARTBEAT: 2` 命令码（协议中不存在此命令）
  - 将停止命令码从 `STOP: 3` 修正为 `STOP: 2`
- 添加了缺失的心跳事件类型码 `HEARTBEAT: 4`

**修改前**:
```typescript
export const CommandCode = {
  START: 1,
  HEARTBEAT: 2,
  STOP: 3,
} as const

export const EventTypeCode = {
  STATUS: 1,
  ERROR: 2,
  DEVICE: 3,
} as const
```

**修改后**:
```typescript
export const CommandCode = {
  START: 1,
  STOP: 2,
} as const

export const EventTypeCode = {
  STATUS: 1,
  ERROR: 2,
  DEVICE: 3,
  HEARTBEAT: 4,
} as const
```

### 2. 从API接口中移除废弃字段

**文件**: `src/communication.ts`

**修改内容**:
- 从 `RequestDataSchema` 中移除了 `did` (deviceId) 字段
- 简化了请求数据格式，只保留 `rssi` 字段

**修改前**:
```typescript
export const RequestDataSchema = z.object({
  rssi: z.string().optional(),
  did: z.string().optional(), // 设备ID，用于指定特定设备
}).passthrough()
```

**修改后**:
```typescript
export const RequestDataSchema = z.object({
  rssi: z.string().optional(),
}).passthrough()
```

### 3. 增强错误处理机制

**文件**: `src/communication.ts`

**修改内容**:
- 定义了标准错误代码 `ErrorCode`
- 创建了 `ErrorInfo` 接口，包含错误代码、消息、建议和上下文信息
- 重构了 `createErrorResponse` 函数，提供详细的错误信息
- 添加了向后兼容的 `createSimpleErrorResponse` 函数

**新增内容**:
```typescript
export const ErrorCode = {
  INVALID_MESSAGE_FORMAT: 'E001',
  UNKNOWN_COMMAND: 'E002',
  COMMAND_EXECUTION_FAILED: 'E003',
  DEVICE_NOT_FOUND: 'E004',
  DEVICE_BUSY: 'E005',
  SCAN_START_FAILED: 'E006',
  SCAN_STOP_FAILED: 'E007',
  INTERNAL_ERROR: 'E999',
} as const

export interface ErrorInfo {
  code: string
  message: string
  suggestion?: string
  context?: Record<string, unknown>
}
```

### 4. 更新设备事件上报格式

**文件**: `src/communication.ts`

**修改内容**:
- 简化了 `createDeviceEvent` 函数，移除了对废弃字段的处理
- 添加了 `createHeartbeatEvent` 函数用于心跳事件

**修改前**:
```typescript
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
```

**修改后**:
```typescript
export function createDeviceEvent(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.DEVICE,
    d: data,
  }
  return JSON.stringify(payload)
}

export function createHeartbeatEvent(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.HEARTBEAT,
    d: data,
  }
  return JSON.stringify(payload)
}
```

### 5. 实现心跳事件上报

**文件**: `src/index.ts`

**修改内容**:
- 添加了心跳定时器功能
- 实现了每2秒发送一次心跳包的机制
- 心跳包包含设备连接状态信息

**新增功能**:
```typescript
function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (transport && deviceManager) {
      const stats = deviceManager.getConnectionStats()
      const heartbeatData = createHeartbeatEvent({
        run: stats.connected > 0,
        connected: stats.connected,
        total: stats.total,
        reconnecting: stats.reconnecting,
      })
      transport.send(heartbeatData)
    }
  }, 2000) // 每2秒发送一次心跳
}
```

### 6. 更新命令处理逻辑

**文件**: `src/index.ts`

**修改内容**:
- 移除了对 `HEARTBEAT` 命令的处理（协议中不存在此命令）
- 更新了所有错误处理，使用新的详细错误响应格式
- 统一了错误消息格式，符合协议规范

**主要变更**:
- 移除了 `onReceiveHeartbeat` 函数
- 更新了 `handleMessage` 函数中的错误处理
- 更新了 `onReceiveStart` 和 `onReceiveStop` 函数的错误处理

### 7. 其他修改

**文件**: `src/http-transport.ts`
- 更新了HTTP传输层的错误响应格式，符合协议规范

**文件**: `src/device-manager.ts`
- 简化了设备事件转发逻辑，移除了废弃字段的添加

## 协议兼容性

修改后的API接口完全符合 `docs/communication-protocol.md` 中定义的协议规范：

1. **命令码**: 严格按照协议文档定义（启动: 1, 停止: 2）
2. **事件码**: 包含所有协议定义的事件类型（状态: 1, 错误: 2, 设备: 3, 心跳: 4）
3. **错误处理**: 提供详细的错误信息，包括错误代码、描述、建议和上下文
4. **心跳机制**: 实现了每2秒发送一次心跳包的功能
5. **字段清理**: 移除了协议中未定义的废弃字段

## 测试验证

代码修改完成后通过了编译测试，确保所有修改都是语法正确且类型安全的。

## 向后兼容性

虽然移除了一些废弃字段，但核心业务逻辑保持不变，现有的设备管理和扫描功能继续正常工作。
