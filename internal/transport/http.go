package transport

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"

	"hjrich.com/bluetooth-device/internal/communication"
)

// HttpTransport HTTP传输层实现
type HttpTransport struct {
	server      *http.Server
	sseClients  []http.ResponseWriter
	clientMutex sync.Mutex
	receiveChan chan RequestWithCallback
	port        int
}

// NewHttpTransport 创建新的HTTP传输实例
func NewHttpTransport(port int) *HttpTransport {
	if port == 0 {
		port = 8888 // 默认端口
	}
	return &HttpTransport{
		sseClients:  make([]http.ResponseWriter, 0),
		receiveChan: make(chan RequestWithCallback, 10),
		port:        port,
	}
}

// Start 启动HTTP服务器
func (h *HttpTransport) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/command", h.handleCommand)
	mux.HandleFunc("/events", h.handleSSE)

	h.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", h.port),
		Handler: mux,
	}

	go func() {
		log.Printf("HTTP server listening on http://0.0.0.0:%d", h.port)
		if err := h.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	return nil
}

// Stop 停止HTTP服务器
func (h *HttpTransport) Stop() error {
	h.clientMutex.Lock()
	defer h.clientMutex.Unlock()

	// 关闭所有SSE连接
	for _, client := range h.sseClients {
		if flusher, ok := client.(http.Flusher); ok {
			flusher.Flush()
		}
	}
	h.sseClients = h.sseClients[:0]

	if h.server != nil {
		log.Println("HTTP server stopped")
		return h.server.Close()
	}
	return nil
}

// Send 发送数据到所有SSE客户端
func (h *HttpTransport) Send(data string) error {
	h.clientMutex.Lock()
	defer h.clientMutex.Unlock()

	log.Printf("Sending event to %d clients", len(h.sseClients))

	// 移除已断开的客户端
	activeClients := make([]http.ResponseWriter, 0, len(h.sseClients))

	for _, client := range h.sseClients {
		_, err := fmt.Fprintf(client, "data: %s\n\n", data)
		if err == nil {
			if flusher, ok := client.(http.Flusher); ok {
				flusher.Flush()
				activeClients = append(activeClients, client)
			}
		}
	}

	h.sseClients = activeClients
	return nil
}

// ReceiveChannel 返回接收指令的通道
func (h *HttpTransport) ReceiveChannel() <-chan RequestWithCallback {
	return h.receiveChan
}

// handleCommand 处理命令请求
func (h *HttpTransport) handleCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	request, err := communication.ParseJSONMessage(string(body))
	if err != nil {
		http.Error(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	// 创建响应通道
	responseChan := make(chan string, 1)
	callback := func(response string) {
		responseChan <- response
	}

	// 发送到接收通道
	select {
	case h.receiveChan <- RequestWithCallback{Request: request, Callback: callback}:
		// 等待响应
		response := <-responseChan
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(response))
	default:
		http.Error(w, "Server busy", http.StatusServiceUnavailable)
	}
}

// handleSSE 处理Server-Sent Events连接
func (h *HttpTransport) handleSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE头部
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// 发送初始连接确认
	fmt.Fprintf(w, "\n")
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}

	h.clientMutex.Lock()
	h.sseClients = append(h.sseClients, w)
	h.clientMutex.Unlock()

	log.Println("SSE client connected")

	// 保持连接直到客户端断开
	<-r.Context().Done()
	log.Println("SSE client disconnected")
}
