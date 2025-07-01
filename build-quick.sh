#!/bin/bash

# 快速构建脚本 - 专为 OrangePi ARMv7 架构优化
# 这是一个简化的构建脚本，用于快速构建 armv7 版本

set -e

# 项目配置
BINARY_NAME="bluetooth-device"
VERSION="1.0.0"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}蓝牙设备检测系统 - 快速构建脚本${NC}"
echo -e "${BLUE}目标架构: ARMv7 (OrangePi)${NC}"
echo ""

# 检查 Go 环境
if ! command -v go &> /dev/null; then
    echo -e "${RED}错误: Go 未安装或不在 PATH 中${NC}"
    exit 1
fi

echo -e "${BLUE}Go 版本: $(go version | awk '{print $3}')${NC}"

# 创建构建目录
mkdir -p build

# 下载依赖
echo -e "${BLUE}下载依赖...${NC}"
go mod download
go mod tidy

# 格式化代码
echo -e "${BLUE}格式化代码...${NC}"
go fmt ./...

# 构建 ARMv7 版本
echo -e "${BLUE}构建 ARMv7 版本...${NC}"
GOOS=linux GOARCH=arm GOARM=7 go build \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o build/${BINARY_NAME} \
    cmd/main.go

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}构建成功!${NC}"
    echo -e "${GREEN}输出文件: build/${BINARY_NAME}${NC}"
    
    # 显示文件信息
    if command -v file &> /dev/null; then
        echo -e "${BLUE}文件信息: $(file build/${BINARY_NAME})${NC}"
    fi
    
    FILE_SIZE=$(du -h "build/${BINARY_NAME}" | cut -f1)
    echo -e "${BLUE}文件大小: ${FILE_SIZE}${NC}"
    
    echo ""
    echo -e "${GREEN}使用方法:${NC}"
    echo "1. 将 build/${BINARY_NAME} 复制到 OrangePi"
    echo "2. 复制并编辑 config.json 配置文件"
    echo "3. 运行: ./${BINARY_NAME}"
    echo ""
    echo -e "${BLUE}或者使用 make install 安装为系统服务${NC}"
else
    echo -e "${RED}构建失败!${NC}"
    exit 1
fi
