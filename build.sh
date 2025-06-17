#!/bin/bash

# 蓝牙设备服务构建脚本
# 支持多平台交叉编译，专门优化 ARMv7 Orange Pi 部署

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目信息
PROJECT_NAME="bluetooth-device"
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u '+%Y-%m-%d_%H:%M:%S_UTC')
GO_VERSION=$(go version | awk '{print $3}')

# 构建目录
BUILD_DIR="build"
DIST_DIR="dist"

# 支持的平台
declare -A PLATFORMS=(
    ["linux-amd64"]="linux amd64"
    ["linux-arm64"]="linux arm64"
    ["linux-armv7"]="linux arm"
    ["linux-armv6"]="linux arm"
    ["windows-amd64"]="windows amd64"
    ["darwin-amd64"]="darwin amd64"
    ["darwin-arm64"]="darwin arm64"
)

# Orange Pi 特定配置
ORANGEPI_TARGET="linux-armv7"
ORANGEPI_GOARM="7"  # ARMv7 架构

# 打印帮助信息
print_help() {
    echo -e "${BLUE}蓝牙设备服务构建脚本${NC}"
    echo ""
    echo "用法: $0 [选项] [平台]"
    echo ""
    echo "选项:"
    echo "  -h, --help          显示帮助信息"
    echo "  -c, --clean         清理构建目录"
    echo "  -a, --all           构建所有支持的平台"
    echo "  -o, --orangepi      专门为 Orange Pi (ARMv7) 构建"
    echo "  -p, --package       构建完成后打包"
    echo "  -v, --verbose       详细输出"
    echo "  --ldflags           自定义链接标志"
    echo ""
    echo "支持的平台:"
    for platform in "${!PLATFORMS[@]}"; do
        echo "  $platform"
    done
    echo ""
    echo "示例:"
    echo "  $0 -o                    # 为 Orange Pi 构建"
    echo "  $0 linux-amd64          # 为 Linux AMD64 构建"
    echo "  $0 -a                    # 构建所有平台"
    echo "  $0 -o -p                 # 为 Orange Pi 构建并打包"
}

# 打印信息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# 打印成功信息
print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 打印警告信息
print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 打印错误信息
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 清理构建目录
clean_build() {
    print_info "清理构建目录..."
    rm -rf "$BUILD_DIR" "$DIST_DIR"
    print_success "构建目录已清理"
}

# 创建构建目录
create_build_dirs() {
    mkdir -p "$BUILD_DIR" "$DIST_DIR"
}

# 获取构建标志
get_ldflags() {
    local custom_ldflags="$1"
    local ldflags="-s -w"
    ldflags="$ldflags -X main.Version=$VERSION"
    ldflags="$ldflags -X main.BuildTime=$BUILD_TIME"
    ldflags="$ldflags -X main.GoVersion=$GO_VERSION"
    
    if [ -n "$custom_ldflags" ]; then
        ldflags="$ldflags $custom_ldflags"
    fi
    
    echo "$ldflags"
}

# 构建单个平台
build_platform() {
    local platform="$1"
    local goos="$2"
    local goarch="$3"
    local custom_ldflags="$4"
    local verbose="$5"
    
    print_info "构建平台: $platform ($goos/$goarch)"
    
    local output_name="$PROJECT_NAME"
    if [ "$goos" = "windows" ]; then
        output_name="${output_name}.exe"
    fi
    
    local output_path="$BUILD_DIR/$platform/$output_name"
    mkdir -p "$(dirname "$output_path")"
    
    # 设置环境变量
    export GOOS="$goos"
    export GOARCH="$goarch"
    
    # ARMv7 特殊处理
    if [ "$platform" = "linux-armv7" ]; then
        export GOARM="$ORANGEPI_GOARM"
        print_info "设置 GOARM=$GOARM (ARMv7 架构)"
    elif [ "$platform" = "linux-armv6" ]; then
        export GOARM="6"
    fi
    
    # 构建命令
    local build_cmd="go build"
    local ldflags=$(get_ldflags "$custom_ldflags")
    
    if [ -n "$ldflags" ]; then
        build_cmd="$build_cmd -ldflags=\"$ldflags\""
    fi
    
    build_cmd="$build_cmd -o \"$output_path\" ./cmd/main.go"
    
    if [ "$verbose" = "true" ]; then
        print_info "执行命令: $build_cmd"
    fi
    
    # 执行构建
    if eval "$build_cmd"; then
        local file_size=$(du -h "$output_path" | cut -f1)
        print_success "构建完成: $output_path ($file_size)"
        
        # 验证文件
        if [ "$goos" = "linux" ]; then
            file "$output_path"
        fi
    else
        print_error "构建失败: $platform"
        return 1
    fi
    
    # 清理环境变量
    unset GOOS GOARCH GOARM
}

# Orange Pi 专用构建
build_orangepi() {
    local custom_ldflags="$1"
    local verbose="$2"
    local package="$3"
    
    print_info "开始 Orange Pi (ARMv7) 专用构建..."
    
    # 构建
    local platform_info=(${PLATFORMS[$ORANGEPI_TARGET]})
    build_platform "$ORANGEPI_TARGET" "${platform_info[0]}" "${platform_info[1]}" "$custom_ldflags" "$verbose"
    
    # 复制配置文件和文档
    local orangepi_dir="$BUILD_DIR/$ORANGEPI_TARGET"
    cp README.md "$orangepi_dir/"
    cp -r docs "$orangepi_dir/"
    
    # 创建启动脚本
    cat > "$orangepi_dir/start.sh" << 'EOF'
#!/bin/bash
# Orange Pi 蓝牙设备服务启动脚本

# 检查串口权限
if [ ! -r /dev/ttyUSB0 ]; then
    echo "警告: 无法访问 /dev/ttyUSB0，请检查设备连接和权限"
    echo "可以尝试: sudo chmod 666 /dev/ttyUSB0"
    echo "或添加用户到 dialout 组: sudo usermod -a -G dialout $USER"
fi

# 设置环境变量
export GOMAXPROCS=$(nproc)

# 启动服务
echo "启动蓝牙设备服务..."
./bluetooth-device
EOF
    chmod +x "$orangepi_dir/start.sh"
    
    # 创建系统服务文件
    cat > "$orangepi_dir/bluetooth-device.service" << EOF
[Unit]
Description=Bluetooth Device Communication Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/opt/bluetooth-device
ExecStart=/opt/bluetooth-device/bluetooth-device
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# 环境变量
Environment=GOMAXPROCS=4

[Install]
WantedBy=multi-user.target
EOF
    
    # 创建安装脚本
    cat > "$orangepi_dir/install.sh" << 'EOF'
#!/bin/bash
# Orange Pi 安装脚本

set -e

INSTALL_DIR="/opt/bluetooth-device"
SERVICE_FILE="/etc/systemd/system/bluetooth-device.service"

echo "安装蓝牙设备服务到 Orange Pi..."

# 创建安装目录
sudo mkdir -p "$INSTALL_DIR"

# 复制文件
sudo cp bluetooth-device "$INSTALL_DIR/"
sudo cp start.sh "$INSTALL_DIR/"
sudo cp -r docs "$INSTALL_DIR/"
sudo cp README.md "$INSTALL_DIR/"

# 设置权限
sudo chmod +x "$INSTALL_DIR/bluetooth-device"
sudo chmod +x "$INSTALL_DIR/start.sh"
sudo chown -R pi:pi "$INSTALL_DIR"

# 安装系统服务
sudo cp bluetooth-device.service "$SERVICE_FILE"
sudo systemctl daemon-reload

echo "安装完成！"
echo ""
echo "使用方法:"
echo "  启动服务: sudo systemctl start bluetooth-device"
echo "  开机自启: sudo systemctl enable bluetooth-device"
echo "  查看状态: sudo systemctl status bluetooth-device"
echo "  查看日志: sudo journalctl -u bluetooth-device -f"
echo ""
echo "手动运行: cd $INSTALL_DIR && ./start.sh"
EOF
    chmod +x "$orangepi_dir/install.sh"
    
    print_success "Orange Pi 构建完成，包含启动脚本和安装脚本"
    
    # 打包
    if [ "$package" = "true" ]; then
        package_orangepi
    fi
}

# 打包 Orange Pi 版本
package_orangepi() {
    print_info "打包 Orange Pi 版本..."
    
    local package_name="${PROJECT_NAME}-${VERSION}-orangepi-armv7"
    local package_path="$DIST_DIR/${package_name}.tar.gz"
    
    cd "$BUILD_DIR"
    tar -czf "../$package_path" "$ORANGEPI_TARGET"
    cd ..
    
    local package_size=$(du -h "$package_path" | cut -f1)
    print_success "打包完成: $package_path ($package_size)"
    
    # 生成校验和
    cd "$DIST_DIR"
    sha256sum "${package_name}.tar.gz" > "${package_name}.tar.gz.sha256"
    cd ..
    
    print_info "SHA256 校验和已生成"
}

# 构建所有平台
build_all() {
    local custom_ldflags="$1"
    local verbose="$2"
    
    print_info "构建所有支持的平台..."
    
    for platform in "${!PLATFORMS[@]}"; do
        local platform_info=(${PLATFORMS[$platform]})
        build_platform "$platform" "${platform_info[0]}" "${platform_info[1]}" "$custom_ldflags" "$verbose"
    done
    
    print_success "所有平台构建完成"
}

# 主函数
main() {
    local clean=false
    local all=false
    local orangepi=false
    local package=false
    local verbose=false
    local custom_ldflags=""
    local target_platform=""
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                print_help
                exit 0
                ;;
            -c|--clean)
                clean=true
                shift
                ;;
            -a|--all)
                all=true
                shift
                ;;
            -o|--orangepi)
                orangepi=true
                shift
                ;;
            -p|--package)
                package=true
                shift
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            --ldflags)
                custom_ldflags="$2"
                shift 2
                ;;
            -*)
                print_error "未知选项: $1"
                print_help
                exit 1
                ;;
            *)
                if [ -z "$target_platform" ]; then
                    target_platform="$1"
                else
                    print_error "只能指定一个目标平台"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # 显示构建信息
    print_info "项目: $PROJECT_NAME"
    print_info "版本: $VERSION"
    print_info "Go 版本: $GO_VERSION"
    print_info "构建时间: $BUILD_TIME"
    echo ""
    
    # 清理
    if [ "$clean" = "true" ]; then
        clean_build
    fi
    
    # 创建构建目录
    create_build_dirs
    
    # 执行构建
    if [ "$orangepi" = "true" ]; then
        build_orangepi "$custom_ldflags" "$verbose" "$package"
    elif [ "$all" = "true" ]; then
        build_all "$custom_ldflags" "$verbose"
    elif [ -n "$target_platform" ]; then
        if [[ -v "PLATFORMS[$target_platform]" ]]; then
            local platform_info=(${PLATFORMS[$target_platform]})
            build_platform "$target_platform" "${platform_info[0]}" "${platform_info[1]}" "$custom_ldflags" "$verbose"
        else
            print_error "不支持的平台: $target_platform"
            print_help
            exit 1
        fi
    else
        print_warning "未指定构建目标，默认为 Orange Pi"
        build_orangepi "$custom_ldflags" "$verbose" "$package"
    fi
    
    print_success "构建脚本执行完成！"
}

# 执行主函数
main "$@"
