#!/bin/bash

# 蓝牙设备检测系统构建脚本
# 支持多架构交叉编译

set -e

# 项目配置
PROJECT_NAME="bluetooth-device-go"
BINARY_NAME="bluetooth-device"
VERSION="1.0.0"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    echo "蓝牙设备检测系统构建脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -a, --arch ARCH     目标架构 (amd64, arm, arm64)"
    echo "  -o, --os OS         目标操作系统 (linux, windows, darwin)"
    echo "  -v, --arm-version   ARM 版本 (6, 7) - 仅当架构为 arm 时有效"
    echo "  -r, --release       构建发布版本"
    echo "  -c, --clean         清理构建文件"
    echo "  -h, --help          显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 -a arm -v 7                    # 构建 ARM v7 版本（OrangePi）"
    echo "  $0 -a amd64                       # 构建 AMD64 版本"
    echo "  $0 -a arm -v 7 -r                # 构建 ARM v7 发布版本"
    echo "  $0 -c                             # 清理构建文件"
}

# 默认配置
GOOS="linux"
GOARCH="arm"
GOARM="7"
RELEASE=false
CLEAN=false

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--arch)
            GOARCH="$2"
            shift 2
            ;;
        -o|--os)
            GOOS="$2"
            shift 2
            ;;
        -v|--arm-version)
            GOARM="$2"
            shift 2
            ;;
        -r|--release)
            RELEASE=true
            shift
            ;;
        -c|--clean)
            CLEAN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 清理构建文件
clean_build() {
    log_info "清理构建文件..."
    rm -rf build/
    rm -rf release/
    log_success "构建文件已清理"
}

# 检查 Go 环境
check_go() {
    if ! command -v go &> /dev/null; then
        log_error "Go 未安装或不在 PATH 中"
        exit 1
    fi
    
    GO_VERSION=$(go version | awk '{print $3}')
    log_info "Go 版本: $GO_VERSION"
}

# 下载依赖
download_deps() {
    log_info "下载依赖..."
    go mod download
    go mod tidy
    log_success "依赖下载完成"
}

# 代码检查
check_code() {
    log_info "格式化代码..."
    go fmt ./...
    
    log_info "代码检查..."
    go vet ./...
    
    log_success "代码检查通过"
}

# 构建二进制文件
build_binary() {
    local output_dir="build"
    local binary_path="$output_dir/$BINARY_NAME"
    
    # 如果是 ARM 架构且不是 arm64，添加 ARM 版本后缀
    if [[ "$GOARCH" == "arm" && "$GOARCH" != "arm64" ]]; then
        binary_path="${binary_path}-armv${GOARM}"
    fi
    
    # 如果不是 Linux 系统，添加系统后缀
    if [[ "$GOOS" != "linux" ]]; then
        binary_path="${binary_path}-${GOOS}"
    fi
    
    # 如果不是 ARM 架构，添加架构后缀
    if [[ "$GOARCH" != "arm" ]]; then
        binary_path="${binary_path}-${GOARCH}"
    fi
    
    # Windows 系统添加 .exe 后缀
    if [[ "$GOOS" == "windows" ]]; then
        binary_path="${binary_path}.exe"
    fi
    
    mkdir -p "$output_dir"
    
    log_info "构建目标: $GOOS/$GOARCH"
    if [[ "$GOARCH" == "arm" && "$GOARCH" != "arm64" ]]; then
        log_info "ARM 版本: v$GOARM"
    fi
    
    # 构建命令
    local build_cmd="GOOS=$GOOS GOARCH=$GOARCH"
    if [[ "$GOARCH" == "arm" && "$GOARCH" != "arm64" ]]; then
        build_cmd="$build_cmd GOARM=$GOARM"
    fi
    
    build_cmd="$build_cmd go build -ldflags \"-s -w -X main.version=$VERSION\" -o $binary_path cmd/main.go"
    
    log_info "执行构建命令: $build_cmd"
    eval $build_cmd
    
    if [[ $? -eq 0 ]]; then
        log_success "构建完成: $binary_path"
        
        # 显示文件信息
        if command -v file &> /dev/null; then
            log_info "文件信息: $(file $binary_path)"
        fi
        
        local file_size=$(du -h "$binary_path" | cut -f1)
        log_info "文件大小: $file_size"
    else
        log_error "构建失败"
        exit 1
    fi
}

# 创建发布包
create_release() {
    local release_dir="release"
    mkdir -p "$release_dir"
    
    log_info "创建发布包..."
    
    # 复制二进制文件
    cp build/* "$release_dir/" 2>/dev/null || true
    
    # 复制配置文件
    if [[ -f "config.json" ]]; then
        cp config.json "$release_dir/config.example.json"
    fi
    
    # 复制服务文件
    if [[ -f "bluetooth-device-go.service" ]]; then
        cp bluetooth-device-go.service "$release_dir/"
    fi
    
    # 创建安装脚本
    cat > "$release_dir/install.sh" << 'EOF'
#!/bin/bash
# 蓝牙设备检测系统安装脚本

set -e

BINARY_NAME="bluetooth-device"
SERVICE_NAME="bluetooth-device-go"

echo "安装蓝牙设备检测系统..."

# 复制二进制文件
sudo cp ${BINARY_NAME}* /usr/local/bin/bluetooth-device
sudo chmod +x /usr/local/bin/bluetooth-device

# 创建配置目录
sudo mkdir -p /opt/bluetooth-device-go
sudo cp config.example.json /opt/bluetooth-device-go/config.json

# 安装服务
sudo cp ${SERVICE_NAME}.service /etc/systemd/system/
sudo systemctl daemon-reload

echo "安装完成！"
echo "请编辑配置文件: /opt/bluetooth-device-go/config.json"
echo "然后启动服务:"
echo "  sudo systemctl enable ${SERVICE_NAME}"
echo "  sudo systemctl start ${SERVICE_NAME}"
EOF
    
    chmod +x "$release_dir/install.sh"
    
    log_success "发布包已创建: $release_dir/"
}

# 主函数
main() {
    log_info "蓝牙设备检测系统构建脚本"
    log_info "项目: $PROJECT_NAME v$VERSION"
    
    if [[ "$CLEAN" == true ]]; then
        clean_build
        exit 0
    fi
    
    check_go
    download_deps
    check_code
    build_binary
    
    if [[ "$RELEASE" == true ]]; then
        create_release
    fi
    
    log_success "构建完成！"
}

# 执行主函数
main "$@"
