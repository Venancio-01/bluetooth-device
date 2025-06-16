# 与上位机通信协议

本文档定义了本设备（以下简称"程序"）与上位机之间通过串口进行的通信协议。

## 1. 通信格式

上位机与程序之间的所有通信都采用 `JSON` 字符串格式，并以换行符 `\n` 结尾。

**请求格式 (上位机 -> 程序):**
```json
{
  "command": "COMMAND_NAME"
}
```

**响应/上报格式 (程序 -> 上位机):**
```json
{
  "type": "EVENT_TYPE",
  "data": {}
}
```

---

## 2. API 定义

### 2.1 启动命令

*   **功能**: 开始扫描周围设备。
*   **上位机 -> 程序**:
    ```json
    { "command": "start" }
    ```
*   **程序 -> 上位机 (响应)**:
    *   成功:
      ```json
      { "type": "status", "data": { "message": "Started successfully" } }
      ```
    *   失败:
      ```json
      { "type": "error", "data": { "message": "Failed to start" } }
      ```

### 2.2 停止命令

*   **功能**: 停止扫描。
*   **上位机 -> 程序**:
    ```json
    { "command": "stop" }
    ```
*   **程序 -> 上位机 (响应)**:
    *   成功:
      ```json
      { "type": "status", "data": { "message": "Stopped successfully" } }
      ```
    *   失败:
      ```json
      { "type": "error", "data": { "message": "Failed to stop" } }
      ```

### 2.3 心跳命令

*   **功能**: 查询程序的运行状态。
*   **上位机 -> 程序**:
    ```json
    { "command": "heartbeat" }
    ```
*   **程序 -> 上位机 (响应)**:
    ```json
    { "type": "status", "data": { "heartbeat": true } }
    ```

### 2.5 上报命令

*   **功能**: 这是程序在`启动命令`执行后，主动向上位机上报扫描到的蓝牙设备信息。
*   **程序 -> 上位机 (主动上报)**:
    ```json
    {
      "type": "device",
      "data": {
        "manufacturer": "Apple, Inc."
      }
    }
    ```
*   **说明**: 每当扫描到一个新的设备，程序就会发送一条这样的消息。`manufacturer` 字段是解析后的厂商信息。
