# 蓝牙设备通信服务 (Go 版本)

这是一个用 Go 语言重写的蓝牙设备中间件程序，原始版本使用 Node.js/TypeScript 开发。该程序通过串口连接蓝牙硬件模块，接收上位机指令，控制蓝牙模块扫描周围设备，并实时上报扫描结果。

## 功能特性

- **串口通信**：通过串口连接蓝牙硬件模块 (/dev/ttyUSB0, 115200 波特率)
- **AT指令控制**：发送 AT 指令控制蓝牙模块进入观察者模式
- **设备发现**：解析蓝牙广播数据，识别设备厂商信息
- **HTTP API**：提供 RESTful API 接收上位机指令
- **实时推送**：通过 Server-Sent Events (SSE) 实时推送设备信息
- **并发处理**：基于 goroutine 和 channel 的高效并发架构

## 项目结构

```
bluetooth-device-go/
├── cmd/
│   └── main.go                    # 主程序入口
├── internal/
│   ├── communication/
│   │   └── communication.go       # 通信协议定义
│   ├── bluetooth/
│   │   ├── device.go             # 蓝牙设备管理
│   │   └── protocol.go           # AT指令协议
│   └── transport/
│       ├── transport.go          # 传输层接口
│       └── http.go               # HTTP传输实现
├── docs/
│   ├── communication-protocol.md  # 通信协议文档
│   ├── requirements.md           # 需求文档
│   ├── migration-to-golang.md    # 迁移指南
│   └── golang-refactor-guide.md  # 重构详细指南
├── go.mod                        # Go 模块文件
├── go.sum                        # 依赖校验文件
├── build.sh                      # 完整构建脚本
├── build-orangepi.sh             # Orange Pi 快速构建脚本
├── Makefile                      # Make 构建配置
├── test_client.go                # 测试客户端
├── mock_demo.go                  # 功能演示
└── README.md                     # 项目说明
```

## 快速开始

### 环境要求

- Go 1.23.4 或更高版本
- Linux 系统（用于串口访问）
- 蓝牙硬件模块（连接到 /dev/ttyUSB0）

### 安装依赖

```bash
go mod download
```

### 构建项目

#### 本地构建
```bash
go build -o bluetooth-device ./cmd/main.go
```

#### Orange Pi (ARMv7) 构建

**快速构建**：
```bash
./build-orangepi.sh
```

**完整构建包**：
```bash
./build.sh -o -p
# 或
make orangepi-package
```

**使用 Makefile**：
```bash
# 查看所有构建选项
make help

# Orange Pi 构建
make orangepi

# 创建部署包
make deploy-orangepi
```

#### 多平台构建
```bash
# 构建所有支持的平台
./build.sh -a
# 或
make all
```

### 运行服务

#### 本地运行
```bash
./bluetooth-device
```

#### Orange Pi 部署
1. 构建 Orange Pi 版本
2. 传输到设备：`scp bluetooth-device-orangepi pi@<orangepi-ip>:~/`
3. 在 Orange Pi 上运行：`chmod +x bluetooth-device-orangepi && ./bluetooth-device-orangepi`

详细部署说明请参考 [Orange Pi 部署指南](docs/orangepi-deployment-guide.md)。

服务将在 `http://localhost:8888` 启动。

### 功能测试

运行功能演示：
```bash
go run mock_demo.go
```

运行测试客户端：
```bash
go run test_client.go
```

## API 接口

### 1. 发送指令

**POST** `/command`

请求格式：
```json
{
  "c": <command_code>,
  "d": <data_object>
}
```

命令码：
- `1`: 启动扫描
- `2`: 心跳检测  
- `3`: 停止扫描

示例：
```bash
# 启动扫描
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"c": 1, "d": {"rssi": "-50"}}'

# 心跳检测
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"c": 2}'

# 停止扫描
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"c": 3}'
```

### 2. 事件推送

**GET** `/events`

通过 Server-Sent Events 接收实时设备信息：

```bash
curl -N http://localhost:8888/events
```

事件格式：
```json
{
  "t": 3,
  "d": {
    "mf": "Apple, Inc."
  }
}
```

## 支持的设备厂商

- Nokia Mobile Phones
- Motorola  
- Apple, Inc.
- Sony Ericsson Mobile Communications
- Samsung Electronics Co. Ltd.
- LG Electronics
- Google

## 开发指南

### 代码结构说明

1. **communication**: 定义通信协议和消息格式
2. **bluetooth**: 蓝牙设备管理和 AT 指令处理
3. **transport**: 传输层抽象和 HTTP 实现

### 关键设计模式

- **接口抽象**: 传输层使用接口设计，支持多种传输方式
- **并发安全**: 使用 mutex 保护共享状态
- **事件驱动**: 基于 channel 的事件通信机制
- **错误处理**: Go 风格的显式错误处理

### 扩展开发

要添加新的传输方式（如 WebSocket），只需：

1. 实现 `ITransport` 接口
2. 在 main.go 中替换传输层实例

## 与 Node.js 版本对比

| 特性 | Node.js 版本 | Go 版本 |
|------|-------------|---------|
| 运行时依赖 | 需要 Node.js 环境 | 单一二进制文件 |
| 内存占用 | 较高 | 较低 |
| 启动速度 | 较慢 | 快速 |
| 并发模型 | 事件循环 | Goroutine |
| 类型安全 | TypeScript 编译时 | Go 编译时 |
| 部署复杂度 | 需要依赖管理 | 简单部署 |

## 故障排除

### 常见问题

1. **串口权限问题**
   ```bash
   sudo chmod 666 /dev/ttyUSB0
   # 或添加用户到 dialout 组
   sudo usermod -a -G dialout $USER
   ```

2. **端口被占用**
   ```bash
   lsof -i :8888
   # 修改端口或终止占用进程
   ```

3. **编译错误**
   ```bash
   go mod tidy  # 清理依赖
   go clean -cache  # 清理缓存
   ```

## 许可证

本项目采用 ISC 许可证。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关文档

- [通信协议文档](docs/communication-protocol.md)
- [项目需求文档](docs/requirements.md)  
- [Go 重构详细指南](docs/golang-refactor-guide.md)
- [迁移指南](docs/migration-to-golang.md)
