# 蓝牙设备服务 Makefile
# 支持多平台构建，专门优化 Orange Pi 部署

# 项目配置
PROJECT_NAME := bluetooth-device
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S_UTC')
GO_VERSION := $(shell go version | awk '{print $$3}')

# 构建配置
BUILD_DIR := build
DIST_DIR := dist
CMD_DIR := ./cmd
MAIN_FILE := $(CMD_DIR)/main.go

# 链接标志
LDFLAGS := -s -w -X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME) -X main.GoVersion=$(GO_VERSION)

# Orange Pi 配置
ORANGEPI_GOOS := linux
ORANGEPI_GOARCH := arm
ORANGEPI_GOARM := 7
ORANGEPI_OUTPUT := $(BUILD_DIR)/$(PROJECT_NAME)-orangepi

# 默认目标
.DEFAULT_GOAL := help

# 帮助信息
.PHONY: help
help: ## 显示帮助信息
	@echo "蓝牙设备服务构建工具"
	@echo ""
	@echo "可用目标:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# 清理
.PHONY: clean
clean: ## 清理构建文件
	@echo "🧹 清理构建文件..."
	@rm -rf $(BUILD_DIR) $(DIST_DIR)
	@rm -f $(PROJECT_NAME) $(PROJECT_NAME)-*
	@echo "✅ 清理完成"

# 创建构建目录
$(BUILD_DIR):
	@mkdir -p $(BUILD_DIR)

$(DIST_DIR):
	@mkdir -p $(DIST_DIR)

# Orange Pi 构建
.PHONY: orangepi
orangepi: $(BUILD_DIR) ## Orange Pi (ARMv7) 构建
	@echo "🍊 Orange Pi 构建..."
	@echo "📋 目标: $(ORANGEPI_GOOS)/$(ORANGEPI_GOARCH) (ARMv$(ORANGEPI_GOARM))"
	@GOOS=$(ORANGEPI_GOOS) GOARCH=$(ORANGEPI_GOARCH) GOARM=$(ORANGEPI_GOARM) \
		go build -ldflags="$(LDFLAGS)" -o $(ORANGEPI_OUTPUT) $(MAIN_FILE)
	@echo "✅ Orange Pi 构建完成: $(ORANGEPI_OUTPUT)"
	@echo "📊 文件大小: $$(du -h $(ORANGEPI_OUTPUT) | cut -f1)"

# Orange Pi 完整包
.PHONY: orangepi-package
orangepi-package: orangepi $(DIST_DIR) ## Orange Pi 完整包（包含脚本和文档）
	@echo "📦 创建 Orange Pi 完整包..."
	@mkdir -p $(BUILD_DIR)/orangepi-package
	@cp $(ORANGEPI_OUTPUT) $(BUILD_DIR)/orangepi-package/$(PROJECT_NAME)
	@cp README.md $(BUILD_DIR)/orangepi-package/
	@cp -r docs $(BUILD_DIR)/orangepi-package/
	
	# 创建启动脚本
	@echo '#!/bin/bash' > $(BUILD_DIR)/orangepi-package/start.sh
	@echo '# Orange Pi 蓝牙设备服务启动脚本' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo '' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo '# 检查串口权限' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo 'if [ ! -r /dev/ttyUSB0 ]; then' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo '    echo "警告: 无法访问 /dev/ttyUSB0，请检查设备连接和权限"' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo '    echo "可以尝试: sudo chmod 666 /dev/ttyUSB0"' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo 'fi' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo '' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo 'echo "启动蓝牙设备服务..."' >> $(BUILD_DIR)/orangepi-package/start.sh
	@echo './$(PROJECT_NAME)' >> $(BUILD_DIR)/orangepi-package/start.sh
	@chmod +x $(BUILD_DIR)/orangepi-package/start.sh
	
	# 创建安装脚本
	@echo '#!/bin/bash' > $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'set -e' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'INSTALL_DIR="/opt/$(PROJECT_NAME)"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'echo "安装蓝牙设备服务到 Orange Pi..."' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'sudo mkdir -p "$$INSTALL_DIR"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'sudo cp $(PROJECT_NAME) "$$INSTALL_DIR/"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'sudo cp start.sh "$$INSTALL_DIR/"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'sudo chmod +x "$$INSTALL_DIR/$(PROJECT_NAME)"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'sudo chmod +x "$$INSTALL_DIR/start.sh"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@echo 'echo "安装完成！运行: cd $$INSTALL_DIR && ./start.sh"' >> $(BUILD_DIR)/orangepi-package/install.sh
	@chmod +x $(BUILD_DIR)/orangepi-package/install.sh
	
	# 打包
	@cd $(BUILD_DIR) && tar -czf ../$(DIST_DIR)/$(PROJECT_NAME)-$(VERSION)-orangepi.tar.gz orangepi-package
	@echo "✅ Orange Pi 完整包创建完成: $(DIST_DIR)/$(PROJECT_NAME)-$(VERSION)-orangepi.tar.gz"

# 所有平台构建
.PHONY: all
all: $(BUILD_DIR) ## 构建所有支持的平台
	@echo "🌍 构建所有平台..."
	
	# Linux AMD64
	@echo "📋 构建 Linux AMD64..."
	@GOOS=linux GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(PROJECT_NAME)-linux-amd64 $(MAIN_FILE)
	
	# Linux ARM64
	@echo "📋 构建 Linux ARM64..."
	@GOOS=linux GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(PROJECT_NAME)-linux-arm64 $(MAIN_FILE)
	
	# Linux ARMv7 (Orange Pi)
	@echo "📋 构建 Linux ARMv7..."
	@GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(PROJECT_NAME)-linux-armv7 $(MAIN_FILE)
	
	# Windows AMD64
	@echo "📋 构建 Windows AMD64..."
	@GOOS=windows GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(PROJECT_NAME)-windows-amd64.exe $(MAIN_FILE)
	
	# macOS AMD64
	@echo "📋 构建 macOS AMD64..."
	@GOOS=darwin GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(PROJECT_NAME)-darwin-amd64 $(MAIN_FILE)
	
	# macOS ARM64
	@echo "📋 构建 macOS ARM64..."
	@GOOS=darwin GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(PROJECT_NAME)-darwin-arm64 $(MAIN_FILE)
	
	@echo "✅ 所有平台构建完成"
	@echo "📁 构建文件位于: $(BUILD_DIR)/"

# 测试
.PHONY: test
test: ## 运行测试
	@echo "🧪 运行测试..."
	@go test -v ./...
	@echo "✅ 测试完成"

# 运行功能演示
.PHONY: demo
demo: ## 运行功能演示
	@echo "🎭 运行功能演示..."
	@go run mock_demo.go

# 运行本地服务
.PHONY: run
run: build ## 构建并运行本地服务
	@echo "🚀 启动服务..."
	@./$(PROJECT_NAME)

# 代码格式化
.PHONY: fmt
fmt: ## 格式化代码
	@echo "🎨 格式化代码..."
	@go fmt ./...
	@echo "✅ 代码格式化完成"

# 代码检查
.PHONY: vet
vet: ## 代码静态检查
	@echo "🔍 代码静态检查..."
	@go vet ./...
	@echo "✅ 代码检查完成"

# 依赖管理
.PHONY: mod-tidy
mod-tidy: ## 整理依赖
	@echo "📦 整理依赖..."
	@go mod tidy
	@echo "✅ 依赖整理完成"

# 显示项目信息
.PHONY: info
info: ## 显示项目信息
	@echo "📋 项目信息"
	@echo "============"
	@echo "项目名称: $(PROJECT_NAME)"
	@echo "版本:     $(VERSION)"
	@echo "构建时间: $(BUILD_TIME)"
	@echo "Go 版本:  $(GO_VERSION)"
	@echo "构建目录: $(BUILD_DIR)"
	@echo "分发目录: $(DIST_DIR)"

# 快速 Orange Pi 部署
.PHONY: deploy-orangepi
deploy-orangepi: orangepi-package ## 快速 Orange Pi 部署包
	@echo "🚀 Orange Pi 部署包已准备就绪"
	@echo ""
	@echo "部署步骤:"
	@echo "1. 传输到 Orange Pi:"
	@echo "   scp $(DIST_DIR)/$(PROJECT_NAME)-$(VERSION)-orangepi.tar.gz pi@<orangepi-ip>:~/"
	@echo ""
	@echo "2. 在 Orange Pi 上解压并安装:"
	@echo "   tar -xzf $(PROJECT_NAME)-$(VERSION)-orangepi.tar.gz"
	@echo "   cd orangepi-package"
	@echo "   ./install.sh"
	@echo ""
	@echo "3. 运行服务:"
	@echo "   cd /opt/$(PROJECT_NAME)"
	@echo "   ./start.sh"

# 开发环境设置
.PHONY: dev-setup
dev-setup: mod-tidy fmt vet ## 开发环境设置
	@echo "🛠️  开发环境设置完成"

# CI/CD 构建
.PHONY: ci
ci: clean dev-setup test all ## CI/CD 完整构建流程
	@echo "🎯 CI/CD 构建完成"
