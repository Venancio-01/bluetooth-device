package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"bluetooth-device-go/internal/app"
	"bluetooth-device-go/internal/logger"
)

// 构建时注入的版本信息
var (
	version   = "dev"
	buildTime = "unknown"
	gitCommit = "unknown"
)

func main() {
	// 解析命令行参数
	var showVersion = flag.Bool("version", false, "显示版本信息")
	var showHelp = flag.Bool("help", false, "显示帮助信息")
	flag.Parse()

	if *showVersion {
		fmt.Printf("蓝牙设备检测系统 - Go 版本\n")
		fmt.Printf("版本: %s\n", version)
		fmt.Printf("构建时间: %s\n", buildTime)
		fmt.Printf("Git 提交: %s\n", gitCommit)
		return
	}

	if *showHelp {
		fmt.Println("蓝牙设备检测系统 - Go 版本")
		fmt.Println("")
		fmt.Println("用法:")
		fmt.Println("  bluetooth-device [选项]")
		fmt.Println("")
		fmt.Println("选项:")
		fmt.Println("  -version    显示版本信息")
		fmt.Println("  -help       显示此帮助信息")
		fmt.Println("")
		fmt.Println("配置文件: config.json")
		return
	}

	fmt.Printf("蓝牙设备检测系统 - Go 版本 %s\n", version)
	fmt.Println("正在启动...")

	// 初始化日志系统（使用默认配置）
	logger.InitGlobalLogger(logger.LoggerConfig{
		Level:              logger.LogLevelInfo,
		EnableDevicePrefix: true,
		EnableTimestamp:    true,
	})
	log := logger.GetLogger()

	var appController *app.AppController

	// 设置信号处理
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// 启动应用程序
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Errorf("Main", "应用程序异常退出: %v", r)
				os.Exit(1)
			}
		}()

		if err := startApplication(&appController, log); err != nil {
			log.Errorf("Main", "启动失败: %v", err)
			os.Exit(1)
		}
	}()

	// 等待信号
	sig := <-sigChan
	log.Infof("Main", "收到信号: %v，正在关闭程序...", sig)

	// 优雅关闭
	if err := shutdownApplication(appController, log); err != nil {
		log.Errorf("Main", "关闭程序时发生错误: %v", err)
		os.Exit(1)
	}

	log.Info("Main", "程序已安全关闭")
}

// startApplication 启动应用程序
func startApplication(appController **app.AppController, log *logger.Logger) error {
	log.Info("Main", "正在启动蓝牙设备检测系统...")

	// 创建应用控制器
	*appController = app.NewAppController("config.json")

	// 初始化应用程序
	if err := (*appController).Initialize(); err != nil {
		return fmt.Errorf("failed to initialize application: %w", err)
	}

	log.Info("Main", "蓝牙设备检测系统启动成功")

	// 保持程序运行
	select {}
}

// shutdownApplication 关闭应用程序
func shutdownApplication(appController *app.AppController, log *logger.Logger) error {
	if appController == nil {
		return nil
	}

	log.Info("Main", "正在关闭应用程序...")

	if err := appController.Shutdown(); err != nil {
		return fmt.Errorf("failed to shutdown application: %w", err)
	}

	return nil
}
