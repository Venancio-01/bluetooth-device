# Orange Pi 蓝牙设备检测系统维护指南

## 文档概述

本文档面向系统维护人员，提供蓝牙设备检测系统的日常维护、配置修改和故障排除指南。

**系统部署状态：**
- 项目路径：`/home/orangepi/smart-cabinet/bluetooth-device`
- 系统服务：`bluetooth-device.service`
- 开机自启动：已配置

## 第一部分：基本操作

### 1.1 服务管理

```bash
# 查看服务状态
sudo systemctl status bluetooth-device.service

# 启动/停止/重启服务
sudo systemctl start bluetooth-device.service
sudo systemctl stop bluetooth-device.service
sudo systemctl restart bluetooth-device.service

# 查看实时日志
sudo journalctl -u bluetooth-device.service -f
```

### 1.2 配置文件修改

**配置文件位置：** `/home/orangepi/smart-cabinet/bluetooth-device/config.json`

```bash
# 编辑配置文件
nano /home/orangepi/smart-cabinet/bluetooth-device/config.json

# 修改后重启服务
sudo systemctl restart bluetooth-device.service
```

**主要配置项说明：**

```json
{
  "devices": [
    {
      "serialPath": "/dev/ttyUSB0",  // 蓝牙模块串口路径
      "deviceId": "bluetooth_device_0",
      "baudRate": 115200,
      "enabled": true
    }
  ],
  "rssi": -60,                      // 信号强度阈值
  "useConfigRssi": true,            // 是否使用配置文件中的rssi值
  "serialTransport": {
    "serialPath": "/dev/ttyS3",     // 上位机通信串口
    "baudRate": 115200
  },
  "logging": {
    "level": "info"                 // 日志级别: debug/info/warn/error
  }
}
```

## 第二部分：故障排查

### 2.1 服务启动失败

**检查步骤：**

```bash
# 1. 查看服务状态和错误信息
sudo systemctl status bluetooth-device.service

# 2. 查看详细日志
sudo journalctl -u bluetooth-device.service -n 20

# 3. 检查配置文件格式
cd /home/orangepi/smart-cabinet/bluetooth-device
cat config.json | python3 -m json.tool

# 4. 手动运行测试
node dist/index.js
```

**常见问题及解决：**

| 错误信息 | 解决方案 |
|---------|---------|
| `Cannot find module` | 运行 `npm install` |
| `Permission denied` | 检查文件权限，运行 `sudo chown -R orangepi:orangepi /home/orangepi/smart-cabinet/` |
| `JSON parse error` | 修正config.json格式错误 |
| `ENOENT: no such file` | 检查文件路径是否正确 |

### 2.2 串口连接失败

**检查步骤：**

```bash
# 1. 检查串口设备是否存在
ls -l /dev/ttyUSB* /dev/ttyS*

# 2. 检查用户权限
groups $USER
# 应该包含dialout组，如果没有则运行：
sudo usermod -a -G dialout $USER
sudo reboot

# 3. 检查串口是否被占用
sudo lsof /dev/ttyUSB0

# 4. 测试串口通信
echo "test" > /dev/ttyUSB0
```

### 2.3 蓝牙设备检测异常

**检查步骤：**

```bash
# 1. 查看检测相关日志
sudo journalctl -u bluetooth-device.service | grep -i "检测\|rssi\|bluetooth"

# 2. 调整RSSI阈值（在config.json中）
# 将rssi值从-60调整到-80（扩大检测范围）

# 3. 重启服务测试
sudo systemctl restart bluetooth-device.service
```

### 2.4 通信异常

**检查步骤：**

```bash
# 1. 检查上位机通信串口
ls -l /dev/ttyS3

# 2. 测试串口通信
echo "test" > /dev/ttyS3

# 3. 检查配置文件中的串口路径和波特率
grep -A 5 "serialTransport" config.json
```

## 第三部分：日常维护

### 3.1 日常检查

```bash
# 每日检查服务状态
sudo systemctl status bluetooth-device.service

# 查看最新日志（检查是否有错误）
sudo journalctl -u bluetooth-device.service --since "1 hour ago" | grep -E "ERROR|WARN"

# 检查系统资源使用
free -h && df -h
```

### 3.2 配置备份

```bash
# 备份配置文件
cp /home/orangepi/smart-cabinet/bluetooth-device/config.json /home/orangepi/config_backup_$(date +%Y%m%d).json

# 清理旧日志（保留最近7天）
sudo journalctl --vacuum-time=7d
```

### 3.3 系统更新

```bash
# 更新前备份
cp /home/orangepi/smart-cabinet/bluetooth-device/config.json /home/orangepi/config_backup.json

# 停止服务
sudo systemctl stop bluetooth-device.service

# 更新代码
cd /home/orangepi/smart-cabinet/bluetooth-device
git pull

# 启动服务
sudo systemctl start bluetooth-device.service

# 检查更新结果
sudo systemctl status bluetooth-device.service
```

## 第四部分：快速参考

### 4.1 常用命令

```bash
# 服务管理
sudo systemctl status bluetooth-device.service    # 查看状态
sudo systemctl restart bluetooth-device.service   # 重启服务
sudo journalctl -u bluetooth-device.service -f    # 查看实时日志

# 配置修改
nano /home/orangepi/smart-cabinet/bluetooth-device/config.json

# 检查串口设备
ls -l /dev/ttyUSB* /dev/ttyS*

# 手动运行测试
cd /home/orangepi/smart-cabinet/bluetooth-device && node dist/index.js
```

### 4.2 故障排查检查清单

**服务无法启动：**
- [ ] 检查服务状态：`sudo systemctl status bluetooth-device.service`
- [ ] 查看错误日志：`sudo journalctl -u bluetooth-device.service -n 20`
- [ ] 验证配置文件：`cat config.json | python3 -m json.tool`
- [ ] 检查串口设备：`ls -l /dev/ttyUSB* /dev/ttyS*`
- [ ] 检查用户权限：`groups $USER`（应包含dialout组）

**通信异常：**
- [ ] 检查串口权限：`ls -l /dev/ttyUSB0 /dev/ttyS3`
- [ ] 测试串口通信：`echo "test" > /dev/ttyUSB0`
- [ ] 检查配置文件中的串口路径和波特率
- [ ] 重新插拔USB设备

**检测异常：**
- [ ] 调整RSSI阈值（config.json中rssi值调大，如-80）
- [ ] 确认周围有蓝牙设备
- [ ] 重启服务测试

---

**重要提醒：**
- 修改配置文件后必须重启服务
- 定期备份配置文件
- 遇到问题先查看日志

---

**文档总结：**

本维护指南涵盖了蓝牙设备检测系统的核心维护内容：
1. **基本操作** - 服务管理和配置修改
2. **故障排查** - 常见问题的诊断和解决
3. **日常维护** - 定期检查和系统更新
4. **快速参考** - 常用命令和检查清单
