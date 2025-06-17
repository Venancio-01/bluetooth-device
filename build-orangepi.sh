#!/bin/bash

# Orange Pi 快速构建脚本
# 专门为 Orange Pi (ARMv7) 开发板构建蓝牙设备服务

set -e

echo "🍊 Orange Pi 蓝牙设备服务快速构建"
echo "=================================="

# 检查 Go 环境
if ! command -v go &> /dev/null; then
    echo "❌ 错误: 未找到 Go 环境，请先安装 Go"
    exit 1
fi

echo "✅ Go 版本: $(go version)"

# 设置交叉编译环境
export GOOS=linux
export GOARCH=arm
export GOARM=7

echo "🔧 目标平台: Linux ARMv7 (Orange Pi)"
echo "📦 开始构建..."

# 构建
go build -ldflags="-s -w" -o bluetooth-device-orangepi ./cmd/main.go

if [ $? -eq 0 ]; then
    echo "✅ 构建成功!"
    echo "📁 输出文件: bluetooth-device-orangepi"
    echo "📊 文件大小: $(du -h bluetooth-device-orangepi | cut -f1)"
    
    # 验证文件
    echo "🔍 文件信息:"
    file bluetooth-device-orangepi
    
    echo ""
    echo "🚀 部署到 Orange Pi:"
    echo "1. 将文件传输到 Orange Pi:"
    echo "   scp bluetooth-device-orangepi pi@<orangepi-ip>:~/"
    echo ""
    echo "2. 在 Orange Pi 上运行:"
    echo "   chmod +x bluetooth-device-orangepi"
    echo "   sudo ./bluetooth-device-orangepi"
    echo ""
    echo "3. 或使用完整构建脚本获得更多功能:"
    echo "   ./build.sh -o -p"
else
    echo "❌ 构建失败"
    exit 1
fi
