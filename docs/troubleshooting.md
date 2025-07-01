# 蓝牙设备检测系统 - 故障排除指南

本指南帮助您诊断和解决蓝牙设备检测系统在运行过程中可能遇到的问题。

## 目录

- [快速诊断](#快速诊断)
- [启动问题](#启动问题)
- [串口通信问题](#串口通信问题)
- [设备连接问题](#设备连接问题)
- [性能问题](#性能问题)
- [日志分析](#日志分析)
- [常见错误代码](#常见错误代码)

## 快速诊断

### 系统状态检查

运行以下命令快速检查系统状态：

```bash
# 检查服务状态
sudo systemctl status bluetooth-device-go

# 检查进程
ps aux | grep bluetooth-device

# 检查端口占用
sudo netstat -tlnp | grep bluetooth-device

# 检查串口设备
ls -la /dev/ttyS*

# 检查日志
sudo journalctl -u bluetooth-device-go --since "1 hour ago"
```

### 配置验证

```bash
# 验证配置文件格式
python3 -m json.tool /opt/bluetooth-device-go/config.json

# 检查配置文件权限
ls -la /opt/bluetooth-device-go/config.json

# 测试配置加载
./bluetooth-device -help
```

## 启动问题

### 问题：服务无法启动

**症状**：
- `systemctl start bluetooth-device-go` 失败
- 服务状态显示 "failed"

**诊断步骤**：

1. **检查服务日志**
   ```bash
   sudo journalctl -u bluetooth-device-go -n 50
   ```

2. **检查二进制文件**
   ```bash
   ls -la /usr/local/bin/bluetooth-device
   file /usr/local/bin/bluetooth-device
   ```

3. **检查权限**
   ```bash
   sudo -u bluetooth-device /usr/local/bin/bluetooth-device -version
   ```

**常见解决方案**：

- **权限问题**
  ```bash
  sudo chmod +x /usr/local/bin/bluetooth-device
  sudo chown bluetooth-device:bluetooth-device /opt/bluetooth-device-go/config.json
  ```

- **配置文件路径错误**
  ```bash
  sudo systemctl edit bluetooth-device-go
  ```
  添加正确的配置路径：
  ```ini
  [Service]
  Environment=CONFIG_PATH=/opt/bluetooth-device-go/config.json
  ```

- **用户不存在**
  ```bash
  sudo useradd -r -s /bin/false bluetooth-device
  sudo usermod -a -G dialout bluetooth-device
  ```

### 问题：配置文件加载失败

**症状**：
- 日志显示 "failed to load config"
- 程序启动后立即退出

**解决方案**：

1. **验证 JSON 格式**
   ```bash
   python3 -m json.tool config.json
   ```

2. **检查必填字段**
   确保配置包含必要的字段：
   ```json
   {
     "devices": [...],
     "serialTransport": {
       "serialPath": "/dev/ttyS1"
     }
   }
   ```

3. **重置为默认配置**
   ```bash
   sudo cp config.json config.json.backup
   sudo wget -O config.json https://raw.githubusercontent.com/your-org/bluetooth-device-go/main/config.json
   ```

## 串口通信问题

### 问题：串口设备无法打开

**症状**：
- 日志显示 "failed to open serial port"
- 错误信息包含 "permission denied" 或 "no such file"

**诊断步骤**：

1. **检查设备存在**
   ```bash
   ls -la /dev/ttyS*
   dmesg | grep ttyS
   ```

2. **检查权限**
   ```bash
   groups bluetooth-device
   ls -la /dev/ttyS1
   ```

3. **检查设备占用**
   ```bash
   sudo lsof /dev/ttyS1
   sudo fuser /dev/ttyS1
   ```

**解决方案**：

- **设备不存在**
  ```bash
  # 检查内核模块
  lsmod | grep serial
  
  # 加载串口模块
  sudo modprobe 8250
  sudo modprobe 8250_platform
  ```

- **权限问题**
  ```bash
  sudo usermod -a -G dialout bluetooth-device
  sudo chmod 666 /dev/ttyS*
  ```

- **设备被占用**
  ```bash
  # 查找占用进程
  sudo lsof /dev/ttyS1
  
  # 终止占用进程
  sudo kill -9 <PID>
  ```

### 问题：串口通信超时

**症状**：
- 日志显示 "serial communication timeout"
- 设备初始化失败

**解决方案**：

1. **增加超时时间**
   ```json
   {
     "serialTransport": {
       "timeout": 10000
     }
   }
   ```

2. **检查波特率设置**
   ```bash
   stty -F /dev/ttyS1
   ```

3. **测试串口通信**
   ```bash
   # 发送测试数据
   echo "AT" > /dev/ttyS1
   
   # 读取响应
   cat /dev/ttyS1
   ```

## 设备连接问题

### 问题：蓝牙设备连接失败

**症状**：
- 日志显示设备连接失败
- 设备状态显示 "disconnected"

**诊断步骤**：

1. **检查硬件连接**
   - 确认串口线缆连接正确
   - 检查蓝牙模块电源
   - 验证波特率设置

2. **测试 AT 指令**
   ```bash
   # 手动发送 AT 指令
   echo -e "+++" > /dev/ttyS3
   sleep 1
   echo -e "AT\r\n" > /dev/ttyS3
   ```

3. **检查设备响应**
   ```bash
   # 监听设备响应
   cat /dev/ttyS3 &
   echo -e "AT\r\n" > /dev/ttyS3
   ```

**解决方案**：

- **重置蓝牙模块**
  ```bash
  # 发送重启指令
  echo -e "AT+RESTART\r\n" > /dev/ttyS3
  ```

- **调整初始化延时**
  ```json
  {
    "devices": [
      {
        "serialPath": "/dev/ttyS3",
        "initDelay": 5000
      }
    ]
  }
  ```

### 问题：设备频繁重连

**症状**：
- 日志显示设备反复连接和断开
- 系统性能下降

**解决方案**：

1. **增加重连间隔**
   ```json
   {
     "reconnectInterval": 10000
   }
   ```

2. **检查硬件稳定性**
   - 检查电源供应
   - 确认线缆质量
   - 验证接地连接

3. **启用调试日志**
   ```json
   {
     "logging": {
       "level": "debug"
     }
   }
   ```

## 性能问题

### 问题：CPU 使用率过高

**症状**：
- 系统响应缓慢
- CPU 使用率持续高于 50%

**诊断步骤**：

1. **检查进程资源使用**
   ```bash
   top -p $(pgrep bluetooth-device)
   htop -p $(pgrep bluetooth-device)
   ```

2. **分析系统调用**
   ```bash
   sudo strace -p $(pgrep bluetooth-device) -c
   ```

**解决方案**：

- **调整日志级别**
  ```json
  {
    "logging": {
      "level": "warn"
    }
  }
  ```

- **增加处理间隔**
  ```json
  {
    "reportInterval": 5000
  }
  ```

- **限制资源使用**
  ```bash
  sudo systemctl edit bluetooth-device-go
  ```
  ```ini
  [Service]
  CPUQuota=30%
  MemoryLimit=50M
  ```

### 问题：内存泄漏

**症状**：
- 内存使用持续增长
- 系统可用内存减少

**诊断步骤**：

1. **监控内存使用**
   ```bash
   while true; do
     ps -o pid,vsz,rss,comm -p $(pgrep bluetooth-device)
     sleep 60
   done
   ```

2. **检查 goroutine 泄漏**
   ```bash
   # 启用 pprof（需要在代码中添加）
   go tool pprof http://localhost:6060/debug/pprof/goroutine
   ```

**解决方案**：

- **重启服务**
  ```bash
  sudo systemctl restart bluetooth-device-go
  ```

- **设置内存限制**
  ```ini
  [Service]
  MemoryLimit=100M
  ```

## 日志分析

### 日志级别说明

| 级别 | 用途 | 示例 |
|------|------|------|
| DEBUG | 详细调试信息 | 串口数据收发 |
| INFO | 一般信息 | 设备连接状态 |
| WARN | 警告信息 | 重连尝试 |
| ERROR | 错误信息 | 连接失败 |

### 常见日志模式

**正常启动**：
```
[INFO] [Main] 正在启动蓝牙设备检测系统...
[INFO] [AppController] 配置加载成功
[INFO] [SerialTransport] 串口连接成功: /dev/ttyS1
[INFO] [BlueDevice] [device_0] 设备初始化完成
[INFO] [HeartbeatManager] 心跳定时器已启动
```

**设备连接问题**：
```
[ERROR] [BlueDevice] [device_0] 串口错误: permission denied
[WARN] [DeviceManager] [device_0] 连接失败，5秒后重试
[INFO] [DeviceManager] [device_0] 尝试重连...
```

**通信错误**：
```
[ERROR] [SerialTransport] 发送数据失败: broken pipe
[WARN] [MessageHandler] 解析消息失败: invalid JSON
```

### 日志收集脚本

```bash
#!/bin/bash
# 收集诊断信息

OUTPUT_FILE="bluetooth-device-diagnostic-$(date +%Y%m%d_%H%M%S).log"

echo "=== 系统信息 ===" >> $OUTPUT_FILE
uname -a >> $OUTPUT_FILE
cat /etc/os-release >> $OUTPUT_FILE

echo -e "\n=== 服务状态 ===" >> $OUTPUT_FILE
systemctl status bluetooth-device-go >> $OUTPUT_FILE

echo -e "\n=== 进程信息 ===" >> $OUTPUT_FILE
ps aux | grep bluetooth-device >> $OUTPUT_FILE

echo -e "\n=== 串口设备 ===" >> $OUTPUT_FILE
ls -la /dev/ttyS* >> $OUTPUT_FILE

echo -e "\n=== 配置文件 ===" >> $OUTPUT_FILE
cat /opt/bluetooth-device-go/config.json >> $OUTPUT_FILE

echo -e "\n=== 最近日志 ===" >> $OUTPUT_FILE
journalctl -u bluetooth-device-go --since "1 hour ago" >> $OUTPUT_FILE

echo "诊断信息已保存到: $OUTPUT_FILE"
```

## 常见错误代码

### 系统错误

| 错误代码 | 含义 | 解决方案 |
|----------|------|----------|
| EACCES | 权限被拒绝 | 检查用户权限和文件权限 |
| ENOENT | 文件或目录不存在 | 检查路径是否正确 |
| EBUSY | 设备忙 | 检查是否有其他进程占用 |
| EAGAIN | 资源暂时不可用 | 稍后重试或增加超时时间 |

### 应用错误

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| "Invalid serial port" | 串口设备无效 | 检查设备路径和权限 |
| "Failed to parse config" | 配置文件格式错误 | 验证 JSON 格式 |
| "Device initialization failed" | 设备初始化失败 | 检查硬件连接和 AT 指令 |
| "Connection timeout" | 连接超时 | 增加超时时间或检查网络 |

### 获取帮助

如果问题仍未解决，请：

1. **收集诊断信息**
   ```bash
   ./collect-diagnostic.sh
   ```

2. **提交 Issue**
   - 包含完整的错误日志
   - 描述重现步骤
   - 提供系统环境信息

3. **联系支持**
   - 邮箱：support@your-org.com
   - 文档：[项目文档](../README.md)

## 预防措施

### 定期维护

1. **日志轮转**
   ```bash
   sudo logrotate -f /etc/logrotate.d/bluetooth-device-go
   ```

2. **配置备份**
   ```bash
   cp /opt/bluetooth-device-go/config.json /backup/config-$(date +%Y%m%d).json
   ```

3. **系统更新**
   ```bash
   sudo apt update && sudo apt upgrade
   ```

### 监控设置

1. **资源监控**
   ```bash
   # 添加到 crontab
   */5 * * * * /usr/local/bin/bluetooth-device-health.sh
   ```

2. **日志监控**
   ```bash
   # 监控错误日志
   tail -f /var/log/syslog | grep bluetooth-device
   ```

3. **性能监控**
   ```bash
   # 监控资源使用
   watch -n 5 'ps -o pid,vsz,rss,pcpu,comm -p $(pgrep bluetooth-device)'
   ```
