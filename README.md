# 蓝牙设备检测系统

一个支持多串口连接的蓝牙设备检测中间件，通过串口与蓝牙模块通信，扫描周围的蓝牙设备并上报给上位机。

## 功能特性

- **多设备支持**: 同时连接和管理多个蓝牙模块
- **设备标识**: 每个设备事件都包含来源设备信息
- **灵活配置**: 支持配置文件和环境变量两种配置方式
- **错误隔离**: 单个设备故障不影响其他设备正常工作
- **多传输层支持**: 支持HTTP和串口两种传输方式与上位机通信
- **实时监控**: 支持设备连接状态监控和统计

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置设备

#### 使用配置文件

复制示例配置文件：
```bash
cp config.example.json config.json
```

编辑 `config.json` 文件：
```json
{
  "devices": [
    {
      "serialPath": "/dev/ttyUSB0",
      "deviceId": "bluetooth_device_0",
      "baudRate": 115200,
      "enabled": true
    },
    {
      "serialPath": "/dev/ttyUSB1",
      "deviceId": "bluetooth_device_1",
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

### 3. 启动服务

```bash
npm start
```

或者使用开发模式：
```bash
npm run dev
```

## 传输层配置

本系统支持两种传输层：HTTP 传输层和串口传输层。

### HTTP 传输层

使用 HTTP API 和 SSE 事件流与上位机通信：

```json
{
  "transport": {
    "type": "http",
    "port": 8888
  }
}
```

### 串口传输层

通过串口与上位机进行双向通信：

```json
{
  "transport": {
    "type": "serial",
    "serialPath": "/dev/ttyUSB2",
    "baudRate": 115200,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none",
    "timeout": 5000
  }
}
```

## API 接口

### HTTP 接口（仅HTTP传输层）

#### 发送命令

```
POST /command
Content-Type: application/json

{
  "c": <command_code>,
  "d": <data>
}
```

#### 接收事件

```
GET /events
```

返回 Server-Sent Events (SSE) 流

### 串口接口（仅串口传输层）

通过串口发送和接收JSON格式的命令和事件数据。

### 命令格式

#### 1. 心跳命令 (c: 2)
```json
{
  "c": 2
}
```

响应：
```json
{
  "t": 1,
  "d": {
    "run": true,
    "devices": {
      "total": 2,
      "connected": 2,
      "failed": 0
    }
  }
}
```

#### 2. 启动扫描 (c: 1)

启动所有设备扫描：
```json
{
  "c": 1,
  "d": {
    "rssi": "-60"
  }
}
```

启动指定设备扫描：
```json
{
  "c": 1,
  "d": {
    "rssi": "-60",
    "did": "bluetooth_device_0"
  }
}
```

#### 3. 停止扫描 (c: 3)

停止所有设备扫描：
```json
{
  "c": 3
}
```

停止指定设备扫描：
```json
{
  "c": 3,
  "d": {
    "did": "bluetooth_device_0"
  }
}
```

### 事件格式

#### 设备发现事件 (t: 3)
```json
{
  "t": 3,
  "d": {
    "mf": "Apple, Inc.",
    "did": "bluetooth_device_0",
    "sp": "/dev/ttyUSB0"
  }
}
```

## 配置说明

### 设备配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| serialPath | string | 是 | - | 串口设备路径 |
| deviceId | string | 否 | 自动生成 | 设备唯一标识符 |
| baudRate | number | 否 | 115200 | 串口波特率 |
| enabled | boolean | 否 | true | 是否启用该设备 |

### 传输配置

#### HTTP 传输层配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 是 | - | 传输类型，设置为 "http" |
| port | number | 否 | 8888 | HTTP服务端口 |

#### 串口传输层配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 是 | - | 传输类型，设置为 "serial" |
| serialPath | string | 是 | - | 串口设备路径 |
| baudRate | number | 否 | 115200 | 串口波特率 |
| dataBits | number | 否 | 8 | 数据位数 |
| stopBits | number | 否 | 1 | 停止位数 |
| parity | string | 否 | "none" | 校验位 (none/even/odd) |
| timeout | number | 否 | 5000 | 超时时间（毫秒） |

### 日志配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| level | string | 否 | "info" | 日志级别 (debug/info/warn/error) |
| enableDevicePrefix | boolean | 否 | true | 是否在日志中显示设备前缀 |

## 开发

### 构建项目
```bash
npm run build
```

### 运行测试
```bash
# 构建项目
npm run build

# 启动服务（在另一个终端）
npm start

# 运行测试脚本（在新终端）
npm test
```

### 代码检查
```bash
npm run lint
```

## 架构改造说明

本次改造将原有的单设备架构升级为支持多设备的架构，主要变更包括：

### 1. 核心架构变更

- **BlueDevice类**: 支持可配置串口路径，添加设备标识和状态管理
- **DeviceManager类**: 新增设备管理器，统一管理多个BlueDevice实例
- **配置管理**: 支持配置文件和环境变量两种配置方式
- **日志系统**: 统一的日志管理，支持设备级别的日志标识

### 2. 通信协议扩展

- 设备事件上报时包含设备标识信息 (`did`, `sp`)
- 支持指定特定设备或所有设备的操作
- 心跳响应包含设备连接统计信息

### 3. 错误处理和容错

- 单个设备故障不影响其他设备
- 自动重连机制，支持指数退避策略
- 详细的错误日志和状态监控

### 4. 新增功能

- 设备连接状态实时监控
- 重连状态查询
- 配置验证和热重载
- 分级日志系统

## 迁移指南

如果您正在从旧版本升级，请注意以下变更：

### 配置文件变更
旧版本硬编码串口路径，新版本需要配置：

```json
{
  "devices": [
    {
      "serialPath": "/dev/ttyUSB0",
      "deviceId": "device_0",
      "enabled": true
    }
  ]
}
```

### API响应格式变更
设备事件现在包含设备标识：

```json
{
  "t": 3,
  "d": {
    "mf": "Apple, Inc.",
    "did": "device_0",
    "sp": "/dev/ttyUSB0"
  }
}
```

### 环境变量支持
可以通过环境变量快速配置：

```bash
export SERIAL_PORTS="/dev/ttyUSB0,/dev/ttyUSB1"
export HTTP_PORT=8888
export LOG_LEVEL=info
```

## 故障排除

### 常见问题

1. **串口权限问题**
   ```bash
   sudo chmod 666 /dev/ttyUSB*
   # 或者将用户添加到dialout组
   sudo usermod -a -G dialout $USER
   ```

2. **设备连接失败**
   - 检查串口设备是否存在
   - 确认设备未被其他程序占用
   - 验证波特率设置是否正确

3. **配置文件错误**
   - 使用 `config.example.json` 作为模板
   - 检查JSON格式是否正确
   - 确认所有必填字段都已设置

### 日志分析

程序会输出详细的日志信息，包括：
- 设备连接状态
- 配置加载情况
- 扫描启动/停止状态
- 设备发现事件
- 错误信息

日志格式：`[组件名] 消息内容`

例如：
```
[ConfigManager] 从配置文件加载配置: /path/to/config.json
[DeviceManager] 设备 bluetooth_device_0 连接成功
[bluetooth_device_0] 接收数据: +OBSERVER:1,0,1234567890AB,-45,FF4C00...
```

## 许可证

MIT License
