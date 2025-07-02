# Makefile for Bluetooth Device Go

# 项目信息
PROJECT_NAME := bluetooth-device-go
BINARY_NAME := bluetooth-device
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "1.0.0")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# 构建目录
BUILD_DIR := build
RELEASE_DIR := release

# Go 相关配置
GO := go
GOOS := linux
GOARCH := arm
GOARM := 7

# 源码目录
SRC_DIR := cmd
MAIN_FILE := $(SRC_DIR)/main.go

# 编译标志
LDFLAGS := -s -w \
	-X 'main.version=$(VERSION)' \
	-X 'main.buildTime=$(BUILD_TIME)' \
	-X 'main.gitCommit=$(GIT_COMMIT)'

# 构建标志
BUILD_FLAGS := -trimpath

# 默认目标
.PHONY: all
all: clean build

# 清理构建文件
.PHONY: clean
clean:
	@echo "清理构建文件..."
	@rm -rf $(BUILD_DIR)
	@rm -rf $(RELEASE_DIR)

# 创建构建目录
.PHONY: create-dirs
create-dirs:
	@mkdir -p $(BUILD_DIR)
	@mkdir -p $(RELEASE_DIR)

# 下载依赖
.PHONY: deps
deps:
	@echo "下载依赖..."
	@$(GO) mod download
	@$(GO) mod tidy

# 格式化代码
.PHONY: fmt
fmt:
	@echo "格式化代码..."
	@$(GO) fmt ./...

# 代码检查
.PHONY: vet
vet:
	@echo "代码检查..."
	@$(GO) vet ./...

# 构建本地版本（当前架构）
.PHONY: build-local
build-local: create-dirs deps fmt vet
	@echo "构建本地版本..."
	@$(GO) build $(BUILD_FLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(BINARY_NAME)-local $(MAIN_FILE)
	@echo "构建完成: $(BUILD_DIR)/$(BINARY_NAME)-local"

# 构建 ARM v7 版本（OrangePi）
.PHONY: build
build: create-dirs deps fmt vet
	@echo "构建 ARM v7 版本..."
	@GOOS=$(GOOS) GOARCH=$(GOARCH) GOARM=$(GOARM) $(GO) build \
		$(BUILD_FLAGS) -ldflags "$(LDFLAGS)" \
		-o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_FILE)
	@echo "构建完成: $(BUILD_DIR)/$(BINARY_NAME)"

# 快速构建（跳过检查）
.PHONY: quick
quick: create-dirs deps
	@echo "快速构建 ARM v7 版本..."
	@GOOS=$(GOOS) GOARCH=$(GOARCH) GOARM=$(GOARM) $(GO) build \
		$(BUILD_FLAGS) -ldflags "$(LDFLAGS)" \
		-o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_FILE)
	@echo "快速构建完成: $(BUILD_DIR)/$(BINARY_NAME)"

# 构建发布版本
.PHONY: release
release: create-dirs build
	@echo "创建发布版本..."
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(RELEASE_DIR)/
	@cp config.json $(RELEASE_DIR)/config.example.json
	@cp bluetooth-device-go.service $(RELEASE_DIR)/
	@echo "发布版本已创建在 $(RELEASE_DIR) 目录"

# 运行本地版本
.PHONY: run
run: build-local
	@echo "运行程序..."
	@./$(BUILD_DIR)/$(BINARY_NAME)-local

# 测试构建（不运行）
.PHONY: test-build
test-build:
	@echo "测试构建（不生成文件）..."
	@GOOS=$(GOOS) GOARCH=$(GOARCH) GOARM=$(GOARM) $(GO) build \
		$(BUILD_FLAGS) -ldflags "$(LDFLAGS)" \
		-o /dev/null $(MAIN_FILE)
	@echo "构建测试通过"

# 安装到系统（需要 root 权限）
.PHONY: install
install: build
	@echo "安装到系统..."
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/
	@sudo cp bluetooth-device-go.service /etc/systemd/system/
	@sudo systemctl daemon-reload
	@echo "安装完成，使用以下命令启动服务："
	@echo "sudo systemctl enable bluetooth-device-go"
	@echo "sudo systemctl start bluetooth-device-go"

# 卸载系统安装
.PHONY: uninstall
uninstall:
	@echo "卸载系统安装..."
	@sudo systemctl stop bluetooth-device-go || true
	@sudo systemctl disable bluetooth-device-go || true
	@sudo rm -f /usr/local/bin/$(BINARY_NAME)
	@sudo rm -f /etc/systemd/system/bluetooth-device-go.service
	@sudo systemctl daemon-reload

# 显示帮助信息
.PHONY: help
help:
	@echo "可用的构建目标："
	@echo "  all          - 清理并构建 ARM v7 版本"
	@echo "  clean        - 清理构建文件"
	@echo "  deps         - 下载依赖"
	@echo "  fmt          - 格式化代码"
	@echo "  vet          - 代码检查"
	@echo "  build-local  - 构建本地版本（当前架构）"
	@echo "  build        - 构建 ARM v7 版本（OrangePi）"
	@echo "  quick        - 快速构建 ARM v7 版本（跳过检查）"
	@echo "  test-build   - 测试构建（不生成文件）"
	@echo "  release      - 创建发布版本"
	@echo "  run          - 运行本地版本"
	@echo "  install      - 安装到系统（需要 root 权限）"
	@echo "  uninstall    - 卸载系统安装"
	@echo "  info         - 显示构建信息"
	@echo "  help         - 显示此帮助信息"

# 显示构建信息
.PHONY: info
info:
	@echo "项目信息："
	@echo "  项目名称: $(PROJECT_NAME)"
	@echo "  二进制名称: $(BINARY_NAME)"
	@echo "  版本: $(VERSION)"
	@echo "  构建时间: $(BUILD_TIME)"
	@echo "  Git 提交: $(GIT_COMMIT)"
	@echo "  目标系统: $(GOOS)"
	@echo "  目标架构: $(GOARCH)"
	@echo "  ARM 版本: $(GOARM)"
	@echo "  Go 版本: $$($(GO) version)"
	@echo "  编译标志: $(LDFLAGS)"
