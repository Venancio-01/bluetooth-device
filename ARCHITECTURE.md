# 多设备蓝牙检测系统架构文档

## 概述

本文档描述了蓝牙设备检测系统从单设备架构改造为多设备架构的详细设计和实现。

## 架构对比

### 改造前（单设备架构）
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   HTTP Client   │◄──►│ HttpTransport│◄──►│ BlueDevice  │
└─────────────────┘    └──────────────┘    │(/dev/ttyUSB0)│
                                           └─────────────┘
```

### 改造后（多设备架构）
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   HTTP Client   │◄──►│ HttpTransport│◄──►│ DeviceManager   │
└─────────────────┘    └──────────────┘    └─────────────────┘
                                                    │
                                           ┌────────┼────────┐
                                           ▼        ▼        ▼
                                    ┌─────────┐ ┌─────────┐ ┌─────────┐
                                    │Device 0 │ │Device 1 │ │Device N │
                                    │(USB0)   │ │(USB1)   │ │(USBN)   │
                                    └─────────┘ └─────────┘ └─────────┘
```

## 核心组件

### 1. BlueDevice 类改造

#### 主要变更
- **构造函数**: 支持可配置串口路径和设备ID
- **状态管理**: 添加设备状态查询方法
- **错误处理**: 改进错误处理和事件发射
- **日志标识**: 所有日志输出包含设备标识

#### 新增方法
```typescript
getDeviceId(): string
getSerialPath(): string
getStatus(): DeviceStatus
isCurrentlyScanning(): boolean
```

#### 事件扩展
```typescript
// 设备事件现在包含设备标识
emit('device', {
  mf: manufacturer,
  deviceId: this.deviceId,
  serialPath: this.serialPath
})

// 新增错误和断开连接事件
emit('error', error)
emit('disconnected', { deviceId, serialPath })
```

### 2. DeviceManager 类（新增）

#### 核心职责
- 管理多个BlueDevice实例的生命周期
- 统一处理设备事件并转发
- 提供设备级别的操作接口
- 实现设备重连和故障隔离

#### 主要方法
```typescript
// 设备管理
initializeDevices(): Promise<void>
getDevice(deviceId: string): BlueDevice | undefined
getAllDevices(): BlueDevice[]
getDevicesInfo(): DeviceInfo[]

// 扫描控制
startScan(rssi: string, deviceId?: string): Promise<void>
stopScan(deviceId?: string): Promise<void>

// 连接管理
disconnectAll(): Promise<void>
reconnectFailedDevices(): Promise<void>

// 状态监控
getConnectionStats(): ConnectionStats
getReconnectStatus(): ReconnectStatus[]
```

#### 重连机制
- 指数退避策略：延迟时间 = 基础延迟 × 2^重试次数
- 最大重连次数限制（默认5次）
- 自动清理重连定时器

### 3. 配置管理系统（新增）

#### ConfigManager 类
```typescript
class ConfigManager {
  // 配置加载优先级：环境变量 > 配置文件 > 默认配置
  loadConfig(): AppConfig
  
  // 配置验证
  validate(): ValidationResult
  
  // 动态配置管理
  addDevice(config: DeviceConfig): void
  removeDevice(serialPath: string): boolean
  setDeviceEnabled(serialPath: string, enabled: boolean): boolean
}
```

#### 配置文件格式
```json
{
  "devices": [
    {
      "serialPath": "/dev/ttyUSB0",
      "deviceId": "bluetooth_device_0",
      "baudRate": 115200,
      "enabled": true
    }
  ],
  "transport": {
    "type": "http",
    "port": 8888
  },
  "logging": {
    "level": "info",
    "enableDevicePrefix": true
  }
}
```

### 4. 日志系统（新增）

#### Logger 类
```typescript
class Logger {
  // 分级日志
  debug(component: string, message: string, ...args: any[]): void
  info(component: string, message: string, ...args: any[]): void
  warn(component: string, message: string, ...args: any[]): void
  error(component: string, message: string, ...args: any[]): void
  
  // 设备专用日志
  deviceInfo(deviceId: string, message: string, ...args: any[]): void
  deviceError(deviceId: string, message: string, ...args: any[]): void
}
```

#### 日志格式
```
2024-01-01T12:00:00.000Z [INFO] [DeviceManager] 设备 bluetooth_device_0 连接成功
2024-01-01T12:00:01.000Z [ERROR] [bluetooth_device_1] 串口连接失败: ENOENT
```

## 通信协议扩展

### 请求格式扩展
```json
{
  "c": 1,
  "d": {
    "rssi": "-60",
    "did": "bluetooth_device_0"  // 新增：设备标识
  }
}
```

### 响应格式扩展
```json
{
  "t": 3,
  "d": {
    "mf": "Apple, Inc.",
    "did": "bluetooth_device_0",  // 新增：来源设备ID
    "sp": "/dev/ttyUSB0"          // 新增：来源串口路径
  }
}
```

### 心跳响应扩展
```json
{
  "t": 1,
  "d": {
    "run": true,
    "devices": {                  // 新增：设备统计
      "total": 3,
      "connected": 2,
      "failed": 0,
      "reconnecting": 1
    },
    "reconnecting": [             // 新增：重连状态
      {
        "deviceId": "bluetooth_device_2",
        "attempts": 2,
        "nextAttemptIn": 20000
      }
    ]
  }
}
```

## 错误处理和容错

### 故障隔离
- 单个设备故障不影响其他设备
- 设备级别的错误事件发射
- 独立的设备状态管理

### 重连策略
```typescript
// 指数退避算法
const delay = baseDelay * Math.pow(2, attempts)

// 重连流程
1. 检测设备断开
2. 从设备列表中移除
3. 发射断开事件
4. 调度重连任务
5. 执行重连（最多5次）
6. 重连成功后重新加入设备列表
```

### 错误分类
- **连接错误**: 串口无法打开、权限不足等
- **通信错误**: 数据发送失败、超时等
- **协议错误**: AT指令响应异常等
- **配置错误**: 配置文件格式错误、设备冲突等

## 性能优化

### 并发处理
- 设备初始化并行执行
- 独立的设备事件循环
- 非阻塞的错误处理

### 资源管理
- 自动清理断开的设备连接
- 重连定时器的生命周期管理
- 内存泄漏防护

### 扩展性
- 支持动态添加/移除设备
- 可插拔的传输层设计
- 模块化的组件架构

## 测试策略

### 单元测试
- BlueDevice类的各种状态转换
- DeviceManager的设备管理逻辑
- ConfigManager的配置验证

### 集成测试
- 多设备并发扫描
- 设备故障恢复
- 配置热重载

### 端到端测试
- 完整的客户端-服务端通信
- 长时间运行稳定性测试
- 压力测试和性能基准

## 部署建议

### 生产环境
```bash
# 使用配置文件
cp config.example.json config.json
# 编辑配置文件设置实际的串口设备

# 构建和启动
npm run build
npm start
```

### 开发环境
```bash
# 使用环境变量快速配置
export SERIAL_PORTS="/dev/ttyUSB0,/dev/ttyUSB1"
export LOG_LEVEL=debug

# 开发模式
npm run dev
```

### 监控和维护
- 定期检查设备连接状态
- 监控重连频率和成功率
- 日志轮转和存储管理
- 性能指标收集

## 未来扩展

### 可能的改进方向
1. **设备发现**: 自动发现可用的串口设备
2. **负载均衡**: 智能分配扫描任务到不同设备
3. **数据聚合**: 多设备数据的去重和聚合
4. **Web界面**: 设备管理和监控的Web界面
5. **API扩展**: RESTful API支持设备管理操作

### 架构演进
- 微服务化：将设备管理独立为服务
- 消息队列：使用Redis/RabbitMQ处理设备事件
- 数据库集成：持久化设备状态和历史数据
- 容器化：Docker化部署和编排
