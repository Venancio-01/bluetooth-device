import type { Server } from 'http'
import type { ITransport, ResponseCallback } from './transport'
import { EventEmitter } from 'events'
import express from 'express'

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
        console.log(`HTTP server listening on http://localhost:${this.port}`)
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
      console.log('Received command with body:', req.body)
      try {
        const cb: ResponseCallback = (response) => {
          res.status(200).send(response)
        }
        this.emit('data', req.body, cb)
      }
      catch (error: any) {
        console.error('!!! Critical error in event handler !!!', error)
        res.status(500).send({ error: 'Internal Server Error', message: error.message })
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
