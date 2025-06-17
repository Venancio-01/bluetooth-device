# Node.js 到 Go 蓝牙设备项目重构指南

## 项目概述

本文档详细记录了将 Node.js 蓝牙设备通信项目迁移到 Go 语言的完整过程，旨在帮助开发者学习 Go 语言的核心特性和最佳实践。

## 1. 项目架构对比

### Node.js 原始架构
```
src/
├── index.ts           # 主程序入口，事件驱动
├── communication.ts   # 通信协议定义
├── blue-device.ts     # 蓝牙设备管理
├── protocol.ts        # AT指令协议
├── transport.ts       # 传输层接口
├── http-transport.ts  # HTTP传输实现
└── utils.ts          # 工具函数
```

### Go 重构后架构
```
cmd/
└── main.go                    # 主程序入口
internal/
├── communication/
│   └── communication.go       # 通信协议定义
├── bluetooth/
│   ├── device.go             # 蓝牙设备管理
│   └── protocol.go           # AT指令协议
└── transport/
    ├── transport.go          # 传输层接口
    └── http.go               # HTTP传输实现
```

## 2. Go 语言核心特性应用

### 2.1 包管理和模块系统

**Go 模块初始化：**
```bash
go mod init hjrich.com/bluetooth-device
```

**依赖管理：**
```go
// go.mod
module hjrich.com/bluetooth-device

go 1.23.4

require (
    go.bug.st/serial v1.6.4
)
```

**关键学习点：**
- Go 使用 `go.mod` 文件管理依赖，类似 Node.js 的 `package.json`
- `internal/` 目录下的包只能被同一模块内的代码导入
- 包名通常与目录名一致

### 2.2 接口和结构体

**传输层接口定义：**
```go
// ResponseCallback 响应回调函数类型
type ResponseCallback func(response string)

// ITransport 传输层接口
type ITransport interface {
    Start() error
    Stop() error
    Send(data string) error
    ReceiveChannel() <-chan RequestWithCallback
}
```

**关键学习点：**
- Go 的接口是隐式实现的，无需显式声明 `implements`
- 函数类型可以作为类型定义，如 `ResponseCallback`
- 通道（Channel）是 Go 的核心并发原语

### 2.3 结构体和方法

**蓝牙设备结构体：**
```go
type BlueDevice struct {
    port            serial.Port
    initializeState InitializeState
    isScanning      bool
    deviceEvents    chan string
    detectedDevices map[string]bool
    mutex           sync.Mutex
}

// 构造函数
func NewBlueDevice() *BlueDevice {
    return &BlueDevice{
        initializeState: Uninitialized,
        isScanning:      false,
        deviceEvents:    make(chan string, 10),
        detectedDevices: make(map[string]bool),
    }
}

// 方法定义
func (bd *BlueDevice) Connect() error {
    // 实现逻辑
}
```

**关键学习点：**
- Go 没有类，使用结构体和方法
- 方法接收者可以是值类型或指针类型
- 构造函数通常命名为 `NewXxx`
- 使用 `sync.Mutex` 保护并发访问

### 2.4 并发编程

**Goroutine 和 Channel：**
```go
// 启动数据读取goroutine
go bd.readData()

// 主事件循环
go func() {
    for {
        select {
        case reqWithCallback := <-httpTransport.ReceiveChannel():
            // 处理请求
        case deviceEvent := <-blueDevice.GetDeviceEventsChannel():
            // 处理设备事件
        case <-ctx.Done():
            return
        }
    }
}()
```

**关键学习点：**
- `go` 关键字启动 goroutine，类似 Node.js 的异步操作
- `select` 语句用于多路复用 channel 操作
- Channel 是 Go 中线程安全的通信机制

### 2.5 错误处理

**Go 的错误处理模式：**
```go
func (bd *BlueDevice) Connect() error {
    port, err := serial.Open("/dev/ttyUSB0", mode)
    if err != nil {
        return fmt.Errorf("failed to open serial port: %w", err)
    }
    bd.port = port
    return nil
}
```

**关键学习点：**
- Go 使用显式错误返回，而非异常机制
- `fmt.Errorf` 用于格式化错误信息
- `%w` 动词用于包装错误，保持错误链

## 3. 核心功能实现对比

### 3.1 通信协议

**Node.js 版本：**
```typescript
export const CommandCode = {
  START: 1,
  HEARTBEAT: 2,
  STOP: 3,
} as const

export function createStatusResponse(data: Record<string, unknown>): string {
  const payload: ResponsePayload = {
    t: EventTypeCode.STATUS,
    d: data,
  }
  return JSON.stringify(payload)
}
```

**Go 版本：**
```go
type CommandCode int

const (
    START     CommandCode = 1
    HEARTBEAT CommandCode = 2
    STOP      CommandCode = 3
)

func CreateStatusResponse(data map[string]interface{}) string {
    response := Response{
        Type: STATUS,
        Data: data,
    }
    jsonData, _ := json.Marshal(response)
    return string(jsonData)
}
```

**关键差异：**
- Go 使用 `const` 块定义常量组
- Go 的 `map[string]interface{}` 对应 TypeScript 的 `Record<string, unknown>`
- Go 使用 `json.Marshal` 进行 JSON 序列化

### 3.2 HTTP 服务器

**Node.js 版本（Express）：**
```typescript
this.app.post('/command', express.json(), (req, res) => {
  const cb: ResponseCallback = (response) => {
    res.status(200).send(response)
  }
  this.emit('data', req.body, cb)
})
```

**Go 版本（标准库）：**
```go
func (h *HttpTransport) handleCommand(w http.ResponseWriter, r *http.Request) {
    body, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "Failed to read request body", http.StatusBadRequest)
        return
    }

    request, err := communication.ParseJSONMessage(string(body))
    if err != nil {
        http.Error(w, "Invalid JSON format", http.StatusBadRequest)
        return
    }

    callback := func(response string) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(response))
    }

    select {
    case h.receiveChan <- RequestWithCallback{Request: request, Callback: callback}:
    default:
        http.Error(w, "Server busy", http.StatusServiceUnavailable)
    }
}
```

**关键差异：**
- Go 使用标准库 `net/http`，无需第三方框架
- Go 的错误处理更加显式
- 使用 Channel 进行组件间通信，而非事件发射器

### 3.3 串口通信

**Node.js 版本：**
```typescript
this.port = new SerialPort({
  path: '/dev/ttyUSB0',
  baudRate: 115200,
  // ...
})

const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
parser.on('data', (data) => {
  this.parseData(data)
})
```

**Go 版本：**
```go
mode := &serial.Mode{
    BaudRate: 115200,
    Parity:   serial.NoParity,
    DataBits: 8,
    StopBits: serial.OneStopBit,
}

port, err := serial.Open("/dev/ttyUSB0", mode)
if err != nil {
    return fmt.Errorf("failed to open serial port: %w", err)
}

// 启动数据读取goroutine
go func() {
    scanner := bufio.NewScanner(bd.port)
    for scanner.Scan() {
        data := scanner.Text()
        bd.parseData(data)
    }
}()
```

**关键差异：**
- Go 使用第三方库 `go.bug.st/serial`
- Go 使用 `bufio.Scanner` 进行行分割读取
- 数据处理在独立的 goroutine 中进行

## 4. 性能和部署优势

### 4.1 编译和部署

**Node.js：**
- 需要 Node.js 运行时环境
- 依赖 node_modules 目录
- 启动时需要解释执行

**Go：**
```bash
# 编译为单一可执行文件
go build -o bluetooth-device ./cmd/main.go

# 交叉编译
GOOS=linux GOARCH=arm64 go build -o bluetooth-device-arm64 ./cmd/main.go
```

**优势：**
- 编译为单一二进制文件，无运行时依赖
- 支持交叉编译，便于嵌入式部署
- 启动速度快，内存占用低

### 4.2 并发性能

**Node.js：**
- 单线程事件循环
- 异步 I/O 处理

**Go：**
- 轻量级 goroutine
- 多核并行处理
- CSP 并发模型

## 5. 学习要点总结

### 5.1 Go 语言特色

1. **静态类型**：编译时类型检查，减少运行时错误
2. **垃圾回收**：自动内存管理
3. **并发原语**：goroutine 和 channel
4. **接口系统**：隐式实现，组合优于继承
5. **错误处理**：显式错误返回

### 5.2 最佳实践

1. **项目结构**：使用 `cmd/` 和 `internal/` 目录
2. **错误处理**：总是检查错误，使用 `fmt.Errorf` 包装
3. **并发安全**：使用 mutex 保护共享状态
4. **资源管理**：及时关闭文件、连接等资源
5. **测试**：编写单元测试和集成测试

### 5.3 迁移经验

1. **逐模块迁移**：先实现核心数据结构，再实现业务逻辑
2. **接口设计**：保持与原系统的 API 兼容性
3. **并发模型**：用 goroutine 和 channel 替代回调和事件
4. **错误处理**：将 try-catch 改为显式错误检查
5. **测试验证**：确保功能一致性

## 6. 运行和测试

### 6.1 构建项目
```bash
go build -o bluetooth-device ./cmd/main.go
```

### 6.2 运行测试
```bash
go run mock_demo.go
```

### 6.3 启动服务
```bash
./bluetooth-device
```

### 6.4 测试客户端
```bash
go run test_client.go
```

通过这次重构，我们成功将一个 Node.js 项目迁移到了 Go，不仅保持了原有功能，还获得了更好的性能和部署便利性。这个过程展示了 Go 语言在系统编程和并发处理方面的优势。
