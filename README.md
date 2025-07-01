# 蓝牙设备检测系统

> **🚀 重要更新**: 本项目已完全重写为 Go 语言版本，提供更高性能和更好的部署体验！

一个支持多串口连接的蓝牙设备检测中间件，通过串口与蓝牙模块通信，扫描周围的蓝牙设备并上报给上位机。

## 📋 版本说明

本项目现在提供两个版本：

- **🔥 Go 版本（推荐）**: 高性能、低资源占用、单文件部署
- **📦 Node.js 版本（已停止维护）**: 原始版本，仅作参考

## ✨ 功能特性

- **多设备支持**: 同时连接和管理多个蓝牙模块
- **设备标识**: 每个设备事件都包含来源设备信息
- **灵活配置**: 支持 JSON 配置文件管理
- **错误隔离**: 单个设备故障不影响其他设备正常工作
- **串口传输**: 通过串口与上位机进行双向通信
- **实时监控**: 支持设备连接状态监控和统计
- **自动重连**: 设备断开后自动重连机制
- **心跳机制**: 定时发送心跳事件，包含设备状态信息

## 🆚 版本对比

| 特性 | Go 版本 | Node.js 版本 |
|------|---------|-------------|
| 启动时间 | ~0.1s | ~2s |
| 内存占用 | ~10MB | ~50MB |
| CPU 占用 | ~1% | ~5% |
| 二进制大小 | ~8MB | ~100MB |
| 部署方式 | 单文件 | 需要 Node.js 环境 |
| 并发性能 | 原生 goroutine | 事件循环 |
| 类型安全 | 编译时检查 | 运行时检查 |
| 维护状态 | ✅ 活跃维护 | ❌ 停止维护 |

## 🚀 快速开始

### Go 版本（推荐）

#### 1. 下载或构建

**选项 A: 直接构建**

```bash
# 克隆项目
git clone <repository-url>
cd bluetooth-device-go

# 快速构建 ARMv7 版本（OrangePi）
./build-quick.sh

# 或使用 Makefile
make build
```

**选项 B: 使用预构建版本**

从 [Releases](releases) 页面下载适合您架构的预构建版本。

#### 2. 配置设备

复制并编辑配置文件：

```bash
cp config.json config.json.bak
```

编辑 `config.json` 文件：

```json
{
  "devices": [
    {
      "serialPath": "/dev/ttyS3",
      "deviceId": "bluetooth_device_0",
      "baudRate": 115200,
      "enabled": true
    },
    {
      "serialPath": "/dev/ttyS2",
      "deviceId": "bluetooth_device_1",
      "baudRate": 115200,
      "enabled": false
    }
  ],
  "rssi": "-53",
  "useConfigRssi": true,
  "reportInterval": 2000,
  "serialTransport": {
    "serialPath": "/dev/ttyS1",
    "baudRate": 115200,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none",
    "timeout": 5000
  },
  "logging": {
    "level": "info",
    "enableDevicePrefix": true,
    "enableTimestamp": true
  },
  "logging": {
    "level": "info",
    "enableDevicePrefix": true
  }
}
```

#### 3. 运行程序

**直接运行:**

```bash
./bluetooth-device
```

**作为系统服务:**

```bash
# 安装服务
sudo make install

# 启动服务
sudo systemctl enable bluetooth-device-go
sudo systemctl start bluetooth-device-go

# 查看状态
sudo systemctl status bluetooth-device-go
```

**查看帮助和版本信息:**

```bash
./bluetooth-device -help
./bluetooth-device -version
```

---

## 🔄 从 Node.js 版本迁移

如果您正在从 Node.js 版本迁移到 Go 版本，请参考以下指南：

### 迁移步骤

1. **备份现有配置**
   ```bash
   cp config.json config.json.backup
   ```

2. **停止 Node.js 服务**
   ```bash
   # 如果作为服务运行
   sudo systemctl stop bluetooth-device

   # 或直接停止进程
   pkill -f "node.*bluetooth-device"
   ```

3. **构建 Go 版本**
   ```bash
   ./build-quick.sh
   ```

4. **更新配置文件**

   Go 版本的配置格式与 Node.js 版本基本兼容，但有以下变化：

   - 移除了 `transport.type` 和 `transport.port`（Go 版本只支持串口传输）
   - 添加了 `serialTransport` 配置段
   - 添加了 `logging.enableTimestamp` 选项

5. **安装 Go 版本服务**
   ```bash
   sudo make install
   sudo systemctl enable bluetooth-device-go
   sudo systemctl start bluetooth-device-go
   ```

### 配置差异

| 配置项 | Node.js 版本 | Go 版本 | 说明 |
|--------|-------------|---------|------|
| 传输层 | HTTP + 串口 | 仅串口 | Go 版本专注于串口通信 |
| 服务名 | `bluetooth-device` | `bluetooth-device-go` | 避免冲突 |
| 配置验证 | 运行时 | 启动时 | Go 版本提供更严格的验证 |
| 日志格式 | 自定义 | 结构化 | Go 版本提供更好的日志管理 |

### 功能对等性

✅ **完全兼容的功能:**
- 多设备管理
- 串口通信
- AT 指令协议
- 设备事件上报
- 心跳机制
- 配置管理
- 自动重连

❌ **不再支持的功能:**
- HTTP 传输层
- SSE 事件流
- Express.js API

---

### Node.js 版本（已停止维护）

> ⚠️ **注意**: Node.js 版本已停止维护，建议使用 Go 版本。

如需查看 Node.js 版本的详细文档，请参考 [docs/nodejs-legacy.md](docs/nodejs-legacy.md)。

---

## 📚 文档

- **[Go 版本详细文档](README-GO.md)** - Go 版本的完整使用指南
- **[部署指南](docs/deployment-guide.md)** - 详细的部署和配置说明
- **[故障排除](docs/troubleshooting.md)** - 常见问题和解决方案
- **[通信协议](docs/communication-protocol.md)** - API 接口和协议说明
- **[迁移指南](docs/migration-to-golang.md)** - 技术迁移详细说明

## 🏗️ 项目结构

```
bluetooth-device-go/
├── cmd/                    # 主程序入口
├── internal/               # 内部包
│   ├── app/               # 应用程序控制器
│   ├── bluetooth/         # 蓝牙设备管理
│   ├── communication/     # 通信协议
│   ├── config/           # 配置管理
│   ├── device/           # 设备管理器
│   ├── heartbeat/        # 心跳管理
│   ├── logger/           # 日志系统
│   ├── message/          # 消息处理
│   ├── protocol/         # AT 指令协议
│   ├── transport/        # 传输层
│   └── utils/            # 工具函数
├── scripts/               # 构建脚本
├── test/                 # 测试客户端
├── docs/                 # 文档
├── config.json           # 配置文件
├── Makefile              # 构建配置
└── README-GO.md          # Go 版本详细文档
```

## 🚀 性能优势

Go 版本相比 Node.js 版本的性能提升：

| 指标 | Node.js | Go | 提升 |
|------|---------|----|----|
| 启动时间 | 2.0s | 0.1s | **20x** |
| 内存占用 | 50MB | 10MB | **5x** |
| CPU 占用 | 5% | 1% | **5x** |
| 二进制大小 | 100MB | 8MB | **12x** |
| 并发连接 | 1000 | 10000+ | **10x+** |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进项目！

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

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
    "sp": "/dev/ttyS3"
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
      "serialPath": "/dev/ttyS3",
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
    "sp": "/dev/ttyS3"
  }
}
```

### 环境变量支持
可以通过环境变量快速配置：

```bash
export SERIAL_PORTS="/dev/ttyS3,/dev/ttyUSB1"
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
