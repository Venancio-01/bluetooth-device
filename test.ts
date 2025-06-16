#!/usr/bin/env ts-node
import process from 'process'
import axios from 'axios'
import { EventSource } from 'eventsource'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const BASE_URL = 'http://localhost:3000'

// 命令码 (与 src/communication.ts 一致)
const CommandCode = {
  START: 1,
  HEARTBEAT: 2,
  STOP: 3,
}

async function sendCommand(command: number, data = {}) {
  try {
    const response = await axios.post(`${BASE_URL}/command`, {
      c: command,
      d: data,
    })
    console.log('✅  Response:')
    console.log(response.data)
  }
  catch (error: any) {
    console.error('❌  Error:')
    if (error.response) {
      console.error(error.response.data)
    }
    else {
      console.error(error.message)
    }
  }
}

yargs(hideBin(process.argv))
  .scriptName('test-client')
  .command(
    'heartbeat',
    'Send heartbeat command',
    () => {},
    async () => {
      console.log('Sending [heartbeat] command...')
      await sendCommand(CommandCode.HEARTBEAT)
    },
  )
  .command(
    'start',
    'Send start scan command',
    () => {},
    async () => {
      console.log('Sending [start] command...')
      await sendCommand(CommandCode.START)
    },
  )
  .command(
    'stop',
    'Send stop scan command',
    () => {},
    async () => {
      console.log('Sending [stop] command...')
      await sendCommand(CommandCode.STOP)
    },
  )
  .command(
    'listen',
    'Listen for device events from the server',
    () => {},
    () => {
      console.log('Listening for events from server...')
      const es = new EventSource(`${BASE_URL}/events`)
      es.onmessage = (event: MessageEvent) => {
        console.log('📩  Received event:')
        console.log(JSON.parse(event.data))
      }
      es.onerror = (err: Event & { status?: number, message?: string }) => {
        if (err.status === 404) {
          console.error('❌ Server not found. Is the main application running?')
        }
        else {
          console.error('❌ EventSource error:', err.message || err)
        }
        es.close()
      }
    },
  )
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .parse()
