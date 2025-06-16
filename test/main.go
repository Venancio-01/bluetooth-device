package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/r3labs/sse/v2"
	"github.com/spf13/cobra"
)

const (
	basePort    = 8888
	cmdStart     = 1
	cmdHeartbeat = 2
	cmdStop      = 3
)

// CommandPayload 对应于ts代码中的 {c: command, d: data}
type CommandPayload struct {
	C int         `json:"c"`
	D interface{} `json:"d"`
}

// 全局变量，用于存储从命令行flag获取的主机名
var host string
var rssi int

// rootCmd 代表了整个应用的根命令
var rootCmd = &cobra.Command{
	Use:   "test-client-go",
	Short: "Go version of the test client for the bluetooth device server.",
	Long:  `A command-line tool written in Go to interact with the bluetooth device server, sending commands and listening for events.`,
}

// sendCommand 函数用于发送HTTP POST请求
func sendCommand(cmdCode int, data interface{}) {
	url := fmt.Sprintf("http://%s:%d/command", host, basePort)
	payload := CommandPayload{
		C: cmdCode,
		D: data,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("❌  序列化JSON失败: %v", err)
	}

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Fatalf("❌  请求失败: %v\n  - 提示: 请确认主程序是否已在运行，并且监听的地址和端口正确。", err)
	}
	defer resp.Body.Close()

	fmt.Println("✅  Response:")
	if resp.StatusCode != http.StatusOK {
		log.Printf("  - 错误: 服务器返回了非200状态码: %d", resp.StatusCode)
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("  - 响应数据: %s", string(bodyBytes))
		return
	}

	// 为了美化输出，我们将响应体解析并重新格式化打印
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		bodyBytes, _ := io.ReadAll(resp.Body)
		fmt.Printf("  - 无法解析JSON响应，原始数据: %s\n", string(bodyBytes))
		return
	}

	prettyJSON, err := json.MarshalIndent(result, "  ", "  ")
	if err != nil {
		log.Fatalf("❌  格式化JSON响应失败: %v", err)
	}
	fmt.Printf("  %s\n", string(prettyJSON))
}

// 子命令定义
var heartbeatCmd = &cobra.Command{
	Use:   "heartbeat",
	Short: "Send heartbeat command",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Sending [heartbeat] command...")
		sendCommand(cmdHeartbeat, struct{}{})
	},
}

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Send start scan command",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Sending [start] command...")
		data := make(map[string]interface{})
		// 检查flag是否被用户设置，cobra为此提供了方便的方法
		if cmd.Flags().Changed("rssi") {
			data["rssi"] = rssi
			fmt.Printf("  - 使用 RSSI 阈值: >= %d\n", rssi)
		}
		sendCommand(cmdStart, data)
	},
}

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Send stop scan command",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Sending [stop] command...")
		sendCommand(cmdStop, struct{}{})
	},
}

var listenCmd = &cobra.Command{
	Use:   "listen",
	Short: "Listen for device events from the server",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Listening for events from server...")
		url := fmt.Sprintf("http://%s:%d/events", host, basePort)
		client := sse.NewClient(url)

		err := client.SubscribeRaw(func(msg *sse.Event) {
			fmt.Println("📩  Received event:")
			// 假设事件数据是JSON，我们尝试格式化它
			var data map[string]interface{}
			if json.Unmarshal(msg.Data, &data) == nil {
				prettyJSON, _ := json.MarshalIndent(data, "  ", "  ")
				fmt.Printf("  %s\n", string(prettyJSON))
			} else {
				// 如果不是合法的JSON，就直接打印原始数据
				fmt.Printf("  %s\n", string(msg.Data))
			}
		})

		if err != nil {
			log.Fatalf("❌ EventSource 错误: %v", err)
		}
	},
}

func init() {
	// 在这里定义全局的flag
	rootCmd.PersistentFlags().StringVarP(&host, "host", "h", "127.0.0.1", "服务器的主机名或IP地址")

	// 为start命令添加特定的flag
	startCmd.Flags().IntVar(&rssi, "rssi", 0, "信号强度 (RSSI) 阈值，只扫描此值以上的设备")

	// 将子命令添加到根命令
	rootCmd.AddCommand(heartbeatCmd, startCmd, stopCmd, listenCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Whoops. There was an error while executing your CLI '%s'", err)
		os.Exit(1)
	}
} 
