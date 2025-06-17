# Orange Pi 部署指南

本文档详细说明如何在 Orange Pi 开发板上部署和运行蓝牙设备通信服务。

## 系统要求

### Orange Pi 硬件要求
- **开发板型号**: Orange Pi 3 LTS, Orange Pi 4 LTS, Orange Pi 5, 或其他支持 ARMv7/ARM64 的型号
- **内存**: 最少 512MB RAM（推荐 1GB 或更多）
- **存储**: 最少 100MB 可用空间
- **USB 接口**: 用于连接蓝牙模块的 USB 串口

### 系统软件要求
- **操作系统**: Ubuntu 20.04/22.04 LTS 或 Debian 11/12
- **内核版本**: 支持 USB 串口驱动
- **权限**: sudo 访问权限

### 蓝牙硬件要求
- 支持 AT 指令的蓝牙模块
- USB 转串口适配器（如果需要）
- 串口设备路径: `/dev/ttyUSB0`

## 构建选项

### 1. 快速构建（推荐）

在开发机上使用快速构建脚本：

```bash
# 克隆项目
git clone <repository-url>
cd bluetooth-device-go

# 快速构建 Orange Pi 版本
./build-orangepi.sh
```

### 2. 完整构建包

使用完整构建脚本创建包含所有部署文件的包：

```bash
# 构建并打包
./build.sh -o -p

# 或使用 Makefile
make orangepi-package
```

### 3. 使用 Makefile

```bash
# 查看所有可用目标
make help

# Orange Pi 构建
make orangepi

# 创建完整部署包
make orangepi-package

# 显示部署说明
make deploy-orangepi
```

## 部署步骤

### 步骤 1: 准备 Orange Pi

1. **更新系统**：
```bash
sudo apt update && sudo apt upgrade -y
```

2. **安装必要工具**：
```bash
sudo apt install -y curl wget tar
```

3. **检查串口设备**：
```bash
# 列出串口设备
ls -la /dev/tty*

# 检查 USB 串口
dmesg | grep tty
```

4. **设置串口权限**：
```bash
# 添加用户到 dialout 组
sudo usermod -a -G dialout $USER

# 或临时设置权限
sudo chmod 666 /dev/ttyUSB0
```

### 步骤 2: 传输文件

#### 方法 1: 使用 SCP（推荐）

```bash
# 传输完整包
scp dist/bluetooth-device-*-orangepi.tar.gz pi@<orangepi-ip>:~/

# 或传输单个文件
scp bluetooth-device-orangepi pi@<orangepi-ip>:~/
```

#### 方法 2: 使用 USB 存储

1. 将构建文件复制到 U 盘
2. 在 Orange Pi 上挂载 U 盘
3. 复制文件到用户目录

#### 方法 3: 使用 wget（如果有在线存储）

```bash
# 在 Orange Pi 上直接下载
wget https://your-server.com/bluetooth-device-orangepi.tar.gz
```

### 步骤 3: 安装服务

#### 自动安装（推荐）

```bash
# 解压完整包
tar -xzf bluetooth-device-*-orangepi.tar.gz
cd orangepi-package  # 或 linux-armv7

# 运行安装脚本
./install.sh
```

#### 手动安装

```bash
# 创建安装目录
sudo mkdir -p /opt/bluetooth-device

# 复制文件
sudo cp bluetooth-device /opt/bluetooth-device/
sudo cp start.sh /opt/bluetooth-device/
sudo cp -r docs /opt/bluetooth-device/
sudo cp README.md /opt/bluetooth-device/

# 设置权限
sudo chmod +x /opt/bluetooth-device/bluetooth-device
sudo chmod +x /opt/bluetooth-device/start.sh
sudo chown -R $USER:$USER /opt/bluetooth-device
```

### 步骤 4: 配置系统服务（可选）

如果使用完整包，会包含 systemd 服务文件：

```bash
# 复制服务文件
sudo cp bluetooth-device.service /etc/systemd/system/

# 重新加载 systemd
sudo systemctl daemon-reload

# 启用服务
sudo systemctl enable bluetooth-device

# 启动服务
sudo systemctl start bluetooth-device
```

## 运行服务

### 手动运行

```bash
# 进入安装目录
cd /opt/bluetooth-device

# 使用启动脚本
./start.sh

# 或直接运行
./bluetooth-device
```

### 系统服务运行

```bash
# 启动服务
sudo systemctl start bluetooth-device

# 查看状态
sudo systemctl status bluetooth-device

# 查看日志
sudo journalctl -u bluetooth-device -f

# 停止服务
sudo systemctl stop bluetooth-device
```

## 验证部署

### 1. 检查服务状态

```bash
# 检查进程
ps aux | grep bluetooth-device

# 检查端口
netstat -tlnp | grep 8888
# 或
ss -tlnp | grep 8888
```

### 2. 测试 HTTP API

```bash
# 心跳测试
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"c": 2}'

# 启动扫描测试
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"c": 1, "d": {"rssi": "-50"}}'
```

### 3. 测试 SSE 事件

```bash
# 监听事件流
curl -N http://localhost:8888/events
```

## 故障排除

### 常见问题

#### 1. 串口权限问题

**症状**: 无法打开串口设备

**解决方案**:
```bash
# 检查设备存在
ls -la /dev/ttyUSB*

# 设置权限
sudo chmod 666 /dev/ttyUSB0

# 或添加用户到组
sudo usermod -a -G dialout $USER
# 需要重新登录生效
```

#### 2. 端口被占用

**症状**: HTTP 服务启动失败

**解决方案**:
```bash
# 查找占用进程
sudo lsof -i :8888

# 终止进程
sudo kill -9 <PID>

# 或修改配置使用其他端口
```

#### 3. 内存不足

**症状**: 程序启动失败或崩溃

**解决方案**:
```bash
# 检查内存使用
free -h

# 检查交换空间
swapon --show

# 如需要，创建交换文件
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 4. 架构不匹配

**症状**: 程序无法执行

**解决方案**:
```bash
# 检查系统架构
uname -m

# 检查文件架构
file bluetooth-device

# 确保使用正确的构建版本
```

### 日志分析

#### 系统服务日志

```bash
# 查看服务日志
sudo journalctl -u bluetooth-device

# 实时跟踪日志
sudo journalctl -u bluetooth-device -f

# 查看最近的错误
sudo journalctl -u bluetooth-device --since "1 hour ago" -p err
```

#### 手动运行日志

```bash
# 运行时查看详细输出
./bluetooth-device 2>&1 | tee bluetooth-device.log

# 分析日志文件
grep -i error bluetooth-device.log
grep -i warning bluetooth-device.log
```

## 性能优化

### 1. 系统优化

```bash
# 设置 CPU 调度器
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# 禁用不必要的服务
sudo systemctl disable bluetooth
sudo systemctl disable cups
```

### 2. 应用优化

```bash
# 设置 Go 运行时参数
export GOMAXPROCS=$(nproc)
export GOGC=100

# 在启动脚本中设置
echo 'export GOMAXPROCS=$(nproc)' >> ~/.bashrc
```

## 监控和维护

### 1. 系统监控

```bash
# 创建监控脚本
cat > /opt/bluetooth-device/monitor.sh << 'EOF'
#!/bin/bash
while true; do
    if ! pgrep bluetooth-device > /dev/null; then
        echo "$(date): Service not running, restarting..."
        systemctl start bluetooth-device
    fi
    sleep 30
done
EOF

chmod +x /opt/bluetooth-device/monitor.sh
```

### 2. 日志轮转

```bash
# 创建 logrotate 配置
sudo tee /etc/logrotate.d/bluetooth-device << 'EOF'
/var/log/bluetooth-device.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
}
EOF
```

## 卸载

```bash
# 停止服务
sudo systemctl stop bluetooth-device
sudo systemctl disable bluetooth-device

# 删除服务文件
sudo rm /etc/systemd/system/bluetooth-device.service
sudo systemctl daemon-reload

# 删除程序文件
sudo rm -rf /opt/bluetooth-device

# 删除日志
sudo rm -f /var/log/bluetooth-device.log*
```

## 技术支持

如果遇到问题，请提供以下信息：

1. Orange Pi 型号和系统版本
2. 错误日志和症状描述
3. 硬件连接情况
4. 系统资源使用情况

```bash
# 收集系统信息
uname -a
cat /etc/os-release
free -h
df -h
lsusb
dmesg | tail -20
```
