import type { Server } from 'http'
import type { ITransport, ResponseCallback } from './transport'
import type { RequestPayload } from './communication'
import { EventEmitter } from 'events'
import express from 'express'
import { parseJSONMessage } from './communication'

export class HttpTransport extends EventEmitter implements ITransport {
  private server: Server | null = null
  private sseClients: express.Response[] = []
  private readonly port: number
  private readonly app: express.Express

  constructor(port = 8888) {
    super()
    this.port = port
    this.app = express()
    this.setupRoutes()
  }

  start = async () => {
    return new Promise<void>((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`HTTP server listening on http://0.0.0.0:${this.port}`)
        resolve()
      })
    })
  }

  stop = async () => {
    return new Promise<void>((resolve) => {
      this.sseClients.forEach(res => res.end())
      this.sseClients = []
      if (this.server) {
        this.server.close(() => {
          console.log('HTTP server stopped')
          resolve()
        })
      }
      else {
        resolve()
      }
    })
  }

  send = (data: string) => {
    console.log(`Sending event to ${this.sseClients.length} clients`)
    this.sseClients.forEach((res) => {
      res.write(`data: ${data}\n\n`)
    })
  }

  private setupRoutes = () => {
    this.app.post('/command', express.json(), (req: express.Request, res: express.Response) => {
      try {
        const cb: ResponseCallback = (response) => {
          res.status(200).send(response)
        }

        // 解析请求数据为 RequestPayload 类型
        const requestPayload = parseJSONMessage(JSON.stringify(req.body))
        if (!requestPayload) {
          this.emit('error', '请求数据格式不正确')
          res.status(400).json({
            t: 2, // ERROR
            d: {
              code: 'E400',
              msg: 'Invalid request format',
              suggestion: 'Please check the request format and try again',
            },
          })
          return
        }

        this.emit('data', requestPayload, cb)
      }
      catch (error: any) {
        const errorMessage = `HTTP传输层处理请求异常: ${error.message}`
        this.emit('error', errorMessage)
        res.status(500).json({
          t: 2, // ERROR
          d: {
            code: 'E999',
            msg: 'Internal Server Error',
            suggestion: 'Please check the request format and try again',
            context: { error: error.message },
          },
        })
      }
    })

    this.app.get('/events', this.setupSse)
  }

  private setupSse = (req: express.Request, res: express.Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    res.write('\n') // Start the SSE stream

    this.sseClients.push(res)
    console.log('SSE client connected')

    res.on('close', () => {
      this.sseClients = this.sseClients.filter(client => client !== res)
      console.log('SSE client disconnected')
    })
  }
}
