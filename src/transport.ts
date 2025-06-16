import type { EventEmitter } from 'events'

export type ResponseCallback = (response: string) => void

export interface ITransport extends EventEmitter {
  start: () => Promise<void>
  stop: () => Promise<void>
  send: (data: string) => void
  on: (event: 'data', listener: (message: string, cb: ResponseCallback) => void) => this
}
