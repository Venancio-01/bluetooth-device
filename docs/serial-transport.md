# 串口传输层使用指南

本文档详细介绍如何配置和使用串口传输层与上位机进行通信。

## 概述

串口传输层允许本程序通过串口与上位机进行双向通信，支持：

- 串口参数配置（波特率、数据位、停止位、校验位等）
- 自动重连机制
- 数据帧解析和封装
- 超时处理
- 错误处理和异常捕获

## 配置说明

### 基本配置

在 `config.json` 中配置串口传输层：

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
    "type": "serial",
    "serialPath": "/dev/ttyUSB2",
    "baudRate": 115200,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none",
    "timeout": 5000
  },
  "logging": {
    "level": "info",
    "enableDevicePrefix": true
  }
}
```

### 配置参数详解

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 是 | - | 传输类型，必须设置为 "serial" |
| serialPath | string | 是 | - | 串口设备路径，如 "/dev/ttyUSB2" |
| baudRate | number | 否 | 115200 | 串口波特率 |
| dataBits | number | 否 | 8 | 数据位数 (5-8) |
| stopBits | number | 否 | 1 | 停止位数 (1-2) |
| parity | string | 否 | "none" | 校验位 ("none", "even", "odd") |
| timeout | number | 否 | 5000 | 超时时间（毫秒） |

## 通信协议

### 数据格式

串口传输层使用 JSON 格式进行数据交换，每条消息以换行符 (`\n`) 结尾。

#### 上位机发送命令格式

```json
{"c": 1, "d": {"rssi": "-60"}}
```

#### 程序响应格式

```json
{"t": 1, "d": {"run": true}}
```

### 命令示例

#### 1. 心跳命令

发送：
```json
{"c": 2}
```

响应：
```json
{"t": 1, "d": {"run": true}}
```

#### 2. 启动扫描

发送：
```json
{"c": 1, "d": {"rssi": "-60"}}
```

响应：
```json
{"t": 1, "d": {"msg": "所有设备开始扫描"}}
```

#### 3. 停止扫描

发送：
```json
{"c": 3}
```

响应：
```json
{"t": 1, "d": {"msg": "所有设备停止扫描"}}
```

#### 4. 设备发现事件

程序主动上报：
```json
{"t": 3, "d": {"mf": "Apple, Inc.", "did": "bluetooth_device_0", "sp": "/dev/ttyUSB0"}}
```

## 连接管理

### 自动重连

串口传输层具备自动重连功能：

- **重连间隔**: 5秒
- **最大重连次数**: 10次
- **重连策略**: 固定间隔重连

### 连接状态监控

程序会在日志中输出连接状态信息：

```
[SerialTransport] 启动串口传输层: /dev/ttyUSB2
[SerialTransport] 串口连接成功: /dev/ttyUSB2
[SerialTransport] 串口连接关闭
[SerialTransport] 5秒后尝试重连 (1/10)
```

## 错误处理

### 常见错误及解决方案

#### 1. 串口设备不存在

**错误信息**: `Error: No such file or directory, cannot open /dev/ttyUSB2`

**解决方案**:
- 检查串口设备是否连接
- 确认设备路径是否正确
- 使用 `ls /dev/tty*` 查看可用串口

#### 2. 串口权限不足

**错误信息**: `Error: Permission denied, cannot open /dev/ttyUSB2`

**解决方案**:
```bash
# 方法1: 修改设备权限
sudo chmod 666 /dev/ttyUSB2

# 方法2: 将用户添加到dialout组
sudo usermod -a -G dialout $USER
# 需要重新登录生效
```

#### 3. 串口被占用

**错误信息**: `Error: Resource busy`

**解决方案**:
- 检查是否有其他程序占用串口
- 使用 `lsof /dev/ttyUSB2` 查看占用进程
- 关闭占用串口的程序

#### 4. 数据解析错误

**错误信息**: `处理接收数据失败`

**解决方案**:
- 确保上位机发送的是有效的JSON格式
- 检查数据是否以换行符结尾
- 启用debug日志查看原始数据

## 调试和监控

### 启用调试日志

在配置文件中设置日志级别为 debug：

```json
{
  "logging": {
    "level": "debug",
    "enableDevicePrefix": true
  }
}
```

### 日志示例

```
[SerialTransport] 启动串口传输层: /dev/ttyUSB2
[SerialTransport] 串口连接成功: /dev/ttyUSB2
[SerialTransport] 接收数据: {"c": 2}
[SerialTransport] 发送数据: {"t": 1, "d": {"run": true}}
```

### 监控工具

可以使用以下工具监控串口通信：

```bash
# 使用minicom监控串口
minicom -D /dev/ttyUSB2 -b 115200

# 使用screen监控串口
screen /dev/ttyUSB2 115200

# 使用cat读取串口数据
cat /dev/ttyUSB2
```

## 性能优化

### 建议配置

对于高频通信场景，建议使用以下配置：

```json
{
  "transport": {
    "type": "serial",
    "serialPath": "/dev/ttyUSB2",
    "baudRate": 230400,
    "timeout": 1000
  }
}
```

### 注意事项

1. **波特率选择**: 根据硬件支持选择合适的波特率
2. **超时设置**: 根据通信频率调整超时时间
3. **数据长度**: 避免发送过长的JSON数据
4. **并发控制**: 串口通信是串行的，避免并发发送

## 与HTTP传输层的对比

| 特性 | HTTP传输层 | 串口传输层 |
|------|------------|------------|
| 连接方式 | 网络连接 | 串口连接 |
| 通信模式 | 请求-响应 + SSE | 双向串行通信 |
| 数据格式 | HTTP + JSON | JSON |
| 连接管理 | HTTP连接池 | 串口连接 |
| 适用场景 | 网络环境 | 嵌入式/直连 |
| 性能 | 高并发 | 低延迟 |

## 故障排除清单

在遇到问题时，请按以下步骤排查：

1. **检查配置文件**: 确认传输层类型和参数正确
2. **验证串口设备**: 确认设备存在且可访问
3. **检查权限**: 确保程序有串口访问权限
4. **查看日志**: 启用debug日志查看详细信息
5. **测试连接**: 使用串口工具测试基本连接
6. **验证数据格式**: 确保JSON格式正确
7. **检查硬件**: 确认串口线缆和设备正常

如果问题仍然存在，请提供详细的错误日志和配置信息。
