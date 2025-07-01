# TypeScript 蓝牙设备服务迁移 Golang 指南

本文档旨在为将现有的 TypeScript 蓝牙设备通信服务项目迁移到 Golang 提供一份详细的技术指南。

## 1. 项目概述

当前项目是一个后台服务，其核心功能如下：
- **硬件通信**: 通过串口（Serial Port）与蓝牙模块进行通信，发送 AT 指令以控制其行为（如：初始化、扫描、停止等）。
- **南北向通信**: 通过一个可插拔的"传输层"（`ITransport`），与外部客户端进行交互。目前已实现 HTTP 传输方式。
- **事件驱动**: 监听并处理来自客户端的指令（如心跳、开始/停止扫描），同时将蓝牙模块发现的设备信息上报给客户端。

## 2. 为何选择 Golang？

将此项目迁移至 Golang 将带来以下主要优势：
- **极致的并发性能**: Golang 的 Goroutine 和 Channel 为处理串口 I/O 和网络 I/O 提供了简洁、高效且不易出错的并发模型。相比 Node.js 的回调或 Promise 机制，Go 的并发代码更易于编写和维护。
- **更高的运行效率**: 作为一门编译型语言，Go 应用拥有更快的启动速度、更低的内存占用，编译后生成单一二进制文件，无需运行时依赖。
- **简化的部署流程**: 无需在目标环境安装 Node.js、npm 等依赖，只需拷贝一个可执行文件即可完成部署，特别适合资源受限的嵌入式环境。
- **静态类型与工具链**: Go 强大的类型系统和丰富的标准库能帮助构建稳定、健壮且易于长期维护的系统。

## 3. Golang 实现方案

### 3.1. 推荐项目结构

建议采用标准的 Golang 项目布局：

```
/bluetooth-device-go
|-- /cmd
|   `-- /main.go             // 程序主入口
|-- /internal
|   |-- /transport           // 传输层接口与实现
|   |   |-- transport.go     // 定义 ITransport 接口
|   |   `-- http.go          // HTTP 传输层实现
|   |-- /bluetooth           // 蓝牙模块交互
|   |   |-- device.go        // BlueDevice 的 Go 实现
|   |   `-- protocol.go      // 封装 AT 指令
|   `-- /communication       // 定义南北向通信的数据结构
|       `-- communication.go // 定义指令码、请求/响应/事件结构体
|-- go.mod                   // Go 模块依赖文件
`-- go.sum
```

### 3.2. 模块设计与迁移指南

#### `communication` (数据结构)

- **文件**: `internal/communication/communication.go`
- **目标**: 替代 `src/communication.ts`。
- **实现**:
  - 使用 `const` 定义 `CommandCode`。
  - 使用 `struct` 定义请求、响应和设备事件的数据结构。利用 `json` tag 实现与 JSON 的轻松转换。

```go
// internal/communication/communication.go
package communication

type CommandCode string

const (
    HEARTBEAT CommandCode = "HEARTBEAT"
    START     CommandCode = "START"
    STOP      CommandCode = "STOP"
)

type Request struct {
    Command CommandCode `json:"c"`
    Data    interface{} `json:"d"`
}

type Response struct {
    Status int         `json:"s"` // 0 for success, other for error
    Msg    string      `json:"m"`
    Data   interface{} `json:"d"`
}

// ... 其他结构体定义
```

#### `protocol` (AT指令)

- **文件**: `internal/bluetooth/protocol.go`
- **目标**: 替代 `src/protocol.ts`。
- **实现**: 将原有的指令构建函数直接翻译成 Golang 函数。

```go
// internal/bluetooth/protocol.go
package bluetooth

import "fmt"

func BuildRestartCommand() string {
    return "AT+RESET\r\n"
}

func BuildObserverCommand(rssi string) string {
    return fmt.Sprintf("AT+SCAN=1,1,%s\r\n", rssi)
}

// ... 其他指令函数
```

#### `transport` (传输层)

- **文件**: `internal/transport/transport.go` 和 `http.go`
- **目标**: 替代 `src/transport.ts` 和 `src/http-transport.ts`。
- **实现**:
  1.  **定义接口**: 在 `transport.go` 中定义接口。注意，Go 中事件监听模式通常由 Channel 实现。

      ```go
      // internal/transport/transport.go
      package transport

      import "project/internal/communication"

      type ITransport interface {
          Start() error
          Stop() error
          Send(event communication.Response) error
          ReceiveChannel() <-chan communication.Request // 用于接收指令的只读 Channel
      }
      ```

  2.  **实现 HTTP Transport**: 在 `http.go` 中实现该接口。使用 `net/http` 包启动一个 HTTP 服务器。当收到请求时，将其解析为 `communication.Request` 并发送到 `ReceiveChannel` 中。

      ```go
      // internal/transport/http.go
      package transport

      // ... import ...

      type HttpTransport struct {
          receiveChan chan communication.Request
          // ...其他字段如 server, address...
      }

      func NewHttpTransport() *HttpTransport {
          return &HttpTransport{
              receiveChan: make(chan communication.Request),
          }
      }

      func (h *HttpTransport) Start() error {
          // 启动 http server...
          // http.HandleFunc("/command", h.handleCommand)
          // go http.ListenAndServe(":8080", nil)
          return nil
      }

      func (h *HttpTransport) handleCommand(w http.ResponseWriter, r *http.Request) {
          // 1. 解析 request body 到 communication.Request
          // 2. 将 request 发送到 channel
          //    h.receiveChan <- req
          // 3. 等待主逻辑处理后返回响应
      }

      // ... 实现接口的其他方法
      ```

#### `bluetooth` (核心设备逻辑)

- **文件**: `internal/bluetooth/device.go`
- **目标**: 替代 `src/blue-device.ts`。
- **实现**: 这是最核心的部分。
  - **依赖**: 使用 `go.bug.st/serial` 库进行串口通信。
  - **结构体**:

    ```go
    // internal/bluetooth/device.go
    package bluetooth

    import (
        "go.bug.st/serial"
        "sync"
        "project/internal/communication"
    )

    type BlueDevice struct {
        port           serial.Port
        initializeState string // "uninitialized", "initializing", "initialized"
        isScanning     bool
        deviceEvents   chan communication.Response // 用于上报设备事件
        mutex          sync.Mutex                  // 用于保护共享状态
    }

    func NewBlueDevice() *BlueDevice {
        return &BlueDevice{
            deviceEvents: make(chan communication.Response),
        }
    }
    ```
  - **连接与数据读取**: `Connect` 方法负责打开并配置串口。成功后，启动一个 **独立的 Goroutine** 专门用于循环读取串口数据。读取到的数据经过解析后，封装成事件，发送到 `deviceEvents` Channel。
  - **发送指令**: `Send` 方法向串口写入数据。
  - **状态管理**: 所有对 `initializeState` 和 `isScanning` 等共享字段的读写操作，都应使用 `mutex` 加锁保护，以防并发冲突。
  - **生命周期方法**: 实现 `Initialize`, `StartScan`, `StopScan` 等方法，内部逻辑与 TS 版本类似，只是异步操作（如 `sleep`）由 `time.Sleep` 实现。

### 3.3. 主程序 `main.go` (串联所有模块)

- **文件**: `cmd/main.go`
- **目标**: 替代 `src/index.ts` 的 `main` 函数。
- **实现**: 这是整个应用的总指挥。
  - **初始化**: 创建 `bluetooth.BlueDevice` 和 `transport.HttpTransport` 实例。
  - **启动服务**: 调用 `transport.Start()` 和 `device.Connect()`。
  - **核心循环**: 使用 `select` 语句在一个 `for` 循环中同时监听多个 Channel，实现核心事件循环。

    ```go
    // cmd/main.go
    package main

    func main() {
        // 1. 初始化 device 和 transport
        device := bluetooth.NewBlueDevice()
        transport := transport.NewHttpTransport()

        // 2. 连接和启动
        go transport.Start()
        err := device.Connect()
        // ... handle error

        // 3. 核心事件循环
        for {
            select {
            case cmd := <-transport.ReceiveChannel():
                // 处理来自 transport 的指令
                // go handleCommand(device, cmd)
            case event := <-device.GetDeviceEventsChannel():
                // 处理来自 device 的事件
                // transport.Send(event)
            case <-ctx.Done(): // (例如使用 context 实现优雅退出)
                // 程序退出
                return
            }
        }
    }
    ```

## 4. 推荐依赖

- **串口通信**: `go get go.bug.st/serial`
- **HTTP路由 (可选)**: 标准库 `net/http` 已足够。若路由复杂，可选用 `go get github.com/gin-gonic/gin`。

## 5. 实现步骤建议

1.  **环境搭建**: 安装 Golang，初始化 Go Modules (`go mod init <module-name>`)。
2.  **由内到外**:
    -   首先实现 `communication` 和 `protocol` 这两个无依赖的包。
    -   然后实现 `bluetooth.device`，可以编写一个简单的 `main` 函数来测试其与硬件的交互是否正常。
    -   接着实现 `transport.http`，同样可以单独测试其收发功能。
3.  **整合**: 最后编写 `cmd/main.go`，将所有模块串联起来，用 Channel 和 `select` 构建最终的事件驱动循环。
4.  **完善**: 添加详细的日志、错误处理和优雅关停（Graceful Shutdown）机制。 
