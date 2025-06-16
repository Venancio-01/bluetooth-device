import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { ITransport, ResponseCallback } from './transport'
import { EventEmitter } from 'events'
import http from 'http'

export class HttpTransport extends EventEmitter implements ITransport {
  private server: Server | null = null
  private sseClients: ServerResponse[] = []
  private readonly port: number

  constructor(port = 8888) {
    super()
    this.port = port
  }

  start = async () => {
    this.server = http.createServer(this.handleRequest)
    return new Promise<void>((resolve) => {
      this.server?.listen(this.port, () => {
        console.log(`HTTP server listening on http://localhost:${this.port}`)
        resolve()
      })
    })
  }

  stop = async () => {
    return new Promise<void>((resolve) => {
      this.sseClients.forEach(res => res.end())
      this.sseClients = []
      if (this.server?.listening) {
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

  private handleRequest = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/command' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        const cb: ResponseCallback = (response) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(response)
        }
        this.emit('data', body, cb)
      })
    }
    else if (req.url === '/events' && req.method === 'GET') {
      this.setupSse(res)
    }
    else {
      res.writeHead(404)
      res.end()
    }
  }

  private setupSse = (res: ServerResponse) => {
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
