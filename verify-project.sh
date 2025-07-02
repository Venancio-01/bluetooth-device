#!/bin/bash

# 蓝牙设备检测系统 - 项目验证脚本
# 验证 Go 重构版本的完整性和功能

set -e

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}蓝牙设备检测系统 - 项目验证脚本${NC}"
echo "========================================"

# 验证计数器
TOTAL_TESTS=0
PASSED_TESTS=0

# 测试函数
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "测试 $TOTAL_TESTS: $test_name ... "
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo -e "${GREEN}通过${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}失败${NC}"
        return 1
    fi
}

# 详细测试函数
run_test_verbose() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "${BLUE}测试 $TOTAL_TESTS: $test_name${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✓ 通过${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo ""
        return 0
    else
        echo -e "${RED}✗ 失败${NC}"
        echo ""
        return 1
    fi
}

echo -e "${YELLOW}1. 环境检查${NC}"
echo "----------------------------------------"

# 检查 Go 环境
run_test "Go 环境" "command -v go"
if command -v go >/dev/null 2>&1; then
    echo "   Go 版本: $(go version | awk '{print $3}')"
fi

# 检查项目文件
run_test "项目结构" "test -f go.mod && test -f cmd/main.go && test -f config.json"
run_test "Makefile" "test -f Makefile"
run_test "构建脚本" "test -f build-quick.sh && test -x build-quick.sh"
run_test "服务文件" "test -f bluetooth-device-go.service"

echo ""
echo -e "${YELLOW}2. 配置文件验证${NC}"
echo "----------------------------------------"

# 验证配置文件
run_test "配置文件格式" "python3 -m json.tool config.json"
run_test "配置文件必填字段" "grep -q '\"devices\"' config.json && grep -q '\"serialTransport\"' config.json"

echo ""
echo -e "${YELLOW}3. 代码质量检查${NC}"
echo "----------------------------------------"

# 代码检查
run_test "Go 模块验证" "go mod verify"
run_test "代码格式检查" "test -z \"\$(gofmt -l .)\""
run_test "代码静态检查" "go vet ./..."

echo ""
echo -e "${YELLOW}4. 构建测试${NC}"
echo "----------------------------------------"

# 清理之前的构建
echo "清理之前的构建..."
make clean >/dev/null 2>&1

# 构建测试
run_test_verbose "本地构建" "make build-local"
run_test_verbose "ARM v7 构建" "make build"
run_test_verbose "发布版本构建" "make release"

echo -e "${YELLOW}5. 功能测试${NC}"
echo "----------------------------------------"

# 功能测试
if [ -f "build/bluetooth-device-local" ]; then
    run_test_verbose "版本信息" "./build/bluetooth-device-local -version"
    run_test_verbose "帮助信息" "./build/bluetooth-device-local -help"
else
    echo -e "${RED}本地二进制文件不存在，跳过功能测试${NC}"
fi

echo ""
echo -e "${YELLOW}6. 文件验证${NC}"
echo "----------------------------------------"

# 验证生成的文件
run_test "ARM 二进制文件" "test -f build/bluetooth-device"
run_test "本地二进制文件" "test -f build/bluetooth-device-local"
run_test "发布目录" "test -d release"
run_test "发布文件完整性" "test -f release/bluetooth-device && test -f release/config.example.json && test -f release/bluetooth-device-go.service"

# 检查文件类型
if command -v file >/dev/null 2>&1 && [ -f "build/bluetooth-device" ]; then
    echo "ARM 二进制文件信息:"
    file build/bluetooth-device | sed 's/^/   /'
fi

if [ -f "build/bluetooth-device-local" ]; then
    echo "本地二进制文件信息:"
    file build/bluetooth-device-local | sed 's/^/   /'
fi

echo ""
echo -e "${YELLOW}7. 文档验证${NC}"
echo "----------------------------------------"

# 文档检查
run_test "主 README" "test -f README.md && grep -q 'Go 版本' README.md"
run_test "Go 版本文档" "test -f README-GO.md"
run_test "部署指南" "test -f docs/deployment-guide.md"
run_test "故障排除指南" "test -f docs/troubleshooting.md"
run_test "项目总结" "test -f PROJECT-SUMMARY.md"

echo ""
echo -e "${YELLOW}8. 构建系统验证${NC}"
echo "----------------------------------------"

# 构建系统测试
run_test "Makefile 语法" "make -n help"
run_test "快速构建脚本" "./build-quick.sh >/dev/null 2>&1"
run_test "构建脚本" "test -f scripts/build.sh && test -x scripts/build.sh"

echo ""
echo "========================================"
echo -e "${BLUE}验证结果总结${NC}"
echo "========================================"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}✓ 所有测试通过！($PASSED_TESTS/$TOTAL_TESTS)${NC}"
    echo ""
    echo -e "${GREEN}🎉 项目验证成功！${NC}"
    echo ""
    echo "项目已准备就绪，可以进行部署："
    echo "1. 使用 './build-quick.sh' 快速构建"
    echo "2. 使用 'make install' 安装为系统服务"
    echo "3. 参考 docs/deployment-guide.md 进行详细部署"
    echo ""
    exit 0
else
    echo -e "${RED}✗ 部分测试失败 ($PASSED_TESTS/$TOTAL_TESTS)${NC}"
    echo ""
    echo -e "${YELLOW}请检查失败的测试项并修复相关问题。${NC}"
    echo ""
    exit 1
fi
