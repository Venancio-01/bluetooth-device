# 蓝牙设备检测系统 - 部署指南

本指南详细介绍如何在不同环境中部署蓝牙设备检测系统的 Go 版本。

## 目录

- [系统要求](#系统要求)
- [OrangePi 部署](#orangepi-部署)
- [通用 Linux 部署](#通用-linux-部署)
- [开发环境部署](#开发环境部署)
- [服务配置](#服务配置)
- [监控和维护](#监控和维护)

## 系统要求

### 硬件要求

- **CPU**: ARMv7 或更高（推荐 ARMv7）
- **内存**: 最少 64MB，推荐 128MB 或更多
- **存储**: 最少 50MB 可用空间
- **串口**: 至少 2 个可用串口设备

### 软件要求

- **操作系统**: Linux（Ubuntu 18.04+ 或 Debian 9+）
- **内核版本**: 4.4 或更高
- **权限**: 串口设备访问权限

### 串口设备

确保以下串口设备可用：

- `/dev/ttyS1` - 与上位机通信
- `/dev/ttyS3` - 蓝牙设备 1
- `/dev/ttyS2` - 蓝牙设备 2（可选）

## OrangePi 部署

### 1. 准备环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要工具
sudo apt install -y wget curl unzip

# 检查串口设备
ls -la /dev/ttyS*

# 设置串口权限
sudo usermod -a -G dialout $USER
sudo chmod 666 /dev/ttyS*
```

### 2. 下载和安装

#### 方法 A: 使用预构建版本

```bash
# 创建安装目录
sudo mkdir -p /opt/bluetooth-device-go
cd /opt/bluetooth-device-go

# 下载预构建版本（替换为实际下载链接）
sudo wget https://github.com/your-org/bluetooth-device-go/releases/latest/download/bluetooth-device-armv7

# 设置执行权限
sudo chmod +x bluetooth-device-armv7
sudo ln -sf bluetooth-device-armv7 bluetooth-device

# 复制配置文件
sudo wget https://raw.githubusercontent.com/your-org/bluetooth-device-go/main/config.json
```

#### 方法 B: 本地构建

```bash
# 在开发机器上构建
git clone <repository-url>
cd bluetooth-device-go
./build-quick.sh

# 传输到 OrangePi
scp build/bluetooth-device orangepi@<orangepi-ip>:/tmp/
scp config.json orangepi@<orangepi-ip>:/tmp/

# 在 OrangePi 上安装
sudo mkdir -p /opt/bluetooth-device-go
sudo mv /tmp/bluetooth-device /opt/bluetooth-device-go/
sudo mv /tmp/config.json /opt/bluetooth-device-go/
sudo chmod +x /opt/bluetooth-device-go/bluetooth-device
```

### 3. 配置系统

```bash
# 创建系统用户
sudo useradd -r -s /bin/false bluetooth-device

# 设置文件权限
sudo chown -R bluetooth-device:bluetooth-device /opt/bluetooth-device-go
sudo chmod 755 /opt/bluetooth-device-go
sudo chmod 644 /opt/bluetooth-device-go/config.json

# 添加用户到串口组
sudo usermod -a -G dialout bluetooth-device
```

### 4. 配置设备

编辑配置文件：

```bash
sudo nano /opt/bluetooth-device-go/config.json
```

根据实际硬件配置修改串口路径：

```json
{
  "devices": [
    {
      "serialPath": "/dev/ttyS3",
      "deviceId": "bluetooth_device_0",
      "baudRate": 115200,
      "enabled": true
    }
  ],
  "serialTransport": {
    "serialPath": "/dev/ttyS1",
    "baudRate": 115200
  },
  "logging": {
    "level": "info"
  }
}
```

### 5. 安装系统服务

```bash
# 下载服务文件
sudo wget -O /etc/systemd/system/bluetooth-device-go.service \
  https://raw.githubusercontent.com/your-org/bluetooth-device-go/main/bluetooth-device-go.service

# 或手动创建服务文件
sudo tee /etc/systemd/system/bluetooth-device-go.service > /dev/null <<EOF
[Unit]
Description=Bluetooth Device Detection System (Go Version)
After=network.target
Wants=network.target

[Service]
Type=simple
User=bluetooth-device
Group=bluetooth-device
WorkingDirectory=/opt/bluetooth-device-go
ExecStart=/opt/bluetooth-device-go/bluetooth-device
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 重新加载 systemd
sudo systemctl daemon-reload

# 启用并启动服务
sudo systemctl enable bluetooth-device-go
sudo systemctl start bluetooth-device-go
```

### 6. 验证部署

```bash
# 检查服务状态
sudo systemctl status bluetooth-device-go

# 查看日志
sudo journalctl -u bluetooth-device-go -f

# 检查进程
ps aux | grep bluetooth-device

# 检查端口占用
sudo netstat -tlnp | grep bluetooth-device
```

## 通用 Linux 部署

### 使用 Makefile 自动安装

```bash
# 克隆项目
git clone <repository-url>
cd bluetooth-device-go

# 构建并安装
make build
sudo make install

# 启动服务
sudo systemctl enable bluetooth-device-go
sudo systemctl start bluetooth-device-go
```

### 手动安装

```bash
# 构建项目
make build

# 复制二进制文件
sudo cp build/bluetooth-device /usr/local/bin/

# 创建配置目录
sudo mkdir -p /etc/bluetooth-device-go
sudo cp config.json /etc/bluetooth-device-go/

# 安装服务文件
sudo cp bluetooth-device-go.service /etc/systemd/system/
sudo systemctl daemon-reload
```

## 开发环境部署

### 本地开发

```bash
# 克隆项目
git clone <repository-url>
cd bluetooth-device-go

# 安装依赖
go mod download

# 本地运行
make run

# 或直接运行
go run cmd/main.go
```

### Docker 部署（开发用）

```bash
# 构建 Docker 镜像
docker build -t bluetooth-device-go .

# 运行容器
docker run -d \
  --name bluetooth-device \
  --device=/dev/ttyS1:/dev/ttyS1 \
  --device=/dev/ttyS3:/dev/ttyS3 \
  -v $(pwd)/config.json:/app/config.json \
  bluetooth-device-go
```

## 服务配置

### 环境变量

支持以下环境变量：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CONFIG_PATH` | `config.json` | 配置文件路径 |
| `LOG_LEVEL` | `info` | 日志级别 |

### 服务参数

编辑服务文件以自定义参数：

```bash
sudo systemctl edit bluetooth-device-go
```

添加环境变量：

```ini
[Service]
Environment=CONFIG_PATH=/etc/bluetooth-device-go/config.json
Environment=LOG_LEVEL=debug
```

### 日志配置

配置日志轮转：

```bash
sudo tee /etc/logrotate.d/bluetooth-device-go > /dev/null <<EOF
/var/log/bluetooth-device-go/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 bluetooth-device bluetooth-device
    postrotate
        systemctl reload bluetooth-device-go
    endscript
}
EOF
```

## 监控和维护

### 健康检查

创建健康检查脚本：

```bash
sudo tee /usr/local/bin/bluetooth-device-health.sh > /dev/null <<'EOF'
#!/bin/bash

SERVICE_NAME="bluetooth-device-go"
LOG_FILE="/var/log/bluetooth-device-health.log"

# 检查服务状态
if ! systemctl is-active --quiet $SERVICE_NAME; then
    echo "$(date): Service $SERVICE_NAME is not running" >> $LOG_FILE
    systemctl restart $SERVICE_NAME
    exit 1
fi

# 检查进程
if ! pgrep -f bluetooth-device > /dev/null; then
    echo "$(date): Process bluetooth-device not found" >> $LOG_FILE
    systemctl restart $SERVICE_NAME
    exit 1
fi

echo "$(date): Health check passed" >> $LOG_FILE
exit 0
EOF

sudo chmod +x /usr/local/bin/bluetooth-device-health.sh
```

### 定时任务

添加 cron 任务进行定期检查：

```bash
# 编辑 crontab
sudo crontab -e

# 添加以下行（每5分钟检查一次）
*/5 * * * * /usr/local/bin/bluetooth-device-health.sh
```

### 性能监控

使用 systemd 监控资源使用：

```bash
# 查看资源使用情况
systemctl show bluetooth-device-go --property=MainPID,MemoryCurrent,CPUUsageNSec

# 设置资源限制
sudo systemctl edit bluetooth-device-go
```

添加资源限制：

```ini
[Service]
MemoryLimit=50M
CPUQuota=50%
```

### 备份和恢复

#### 备份配置

```bash
#!/bin/bash
BACKUP_DIR="/backup/bluetooth-device-go"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /opt/bluetooth-device-go/config.json $BACKUP_DIR/config_$DATE.json
cp /etc/systemd/system/bluetooth-device-go.service $BACKUP_DIR/service_$DATE.service
```

#### 恢复配置

```bash
#!/bin/bash
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_config_file>"
    exit 1
fi

sudo cp $BACKUP_FILE /opt/bluetooth-device-go/config.json
sudo systemctl restart bluetooth-device-go
```

## 故障排除

### 常见问题

1. **串口权限问题**
   ```bash
   sudo usermod -a -G dialout bluetooth-device
   sudo chmod 666 /dev/ttyS*
   ```

2. **服务启动失败**
   ```bash
   sudo journalctl -u bluetooth-device-go -n 50
   ```

3. **配置文件错误**
   ```bash
   # 验证 JSON 格式
   python3 -m json.tool /opt/bluetooth-device-go/config.json
   ```

### 调试模式

启用调试日志：

```bash
sudo systemctl edit bluetooth-device-go
```

```ini
[Service]
Environment=LOG_LEVEL=debug
```

```bash
sudo systemctl restart bluetooth-device-go
sudo journalctl -u bluetooth-device-go -f
```

更多故障排除信息请参考 [troubleshooting.md](troubleshooting.md)。
