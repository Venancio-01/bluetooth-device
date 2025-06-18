import type { EventEmitter } from 'events'
import type { RequestPayload } from './communication'

export type ResponseCallback = (response: string) => void

export interface ITransport extends EventEmitter {
  start: () => Promise<void>
  stop: () => Promise<void>
  send: (data: string) => void
  on: ((event: 'data', listener: (data: RequestPayload, cb: ResponseCallback) => void) => this)
    & ((event: 'error', listener: (error: string, cb: ResponseCallback) => void) => this)
}
