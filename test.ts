#!/usr/bin/env ts-node
import type { AxiosError } from 'axios'
import type { ErrorEvent } from 'eventsource'
import process from 'process'
import axios from 'axios'
import { EventSource } from 'eventsource'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const BASE_URL = 'http://192.168.110.218:8888'

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
    console.error('❌  请求失败:')
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      if (axiosError.response) {
        // 服务器返回了错误状态码
        console.error(`  - 状态码: ${axiosError.response.status}`)
        console.error('  - 响应数据:', axiosError.response.data)
      }
      else if (axiosError.request) {
        // 请求已发出，但没有收到响应
        console.error('  - 错误: 未收到服务器响应。')
        console.error('  - 提示: 请确认主程序 (src/index.ts) 是否已在运行，并且监听的地址和端口正确。')
      }
      else {
        // 设置请求时发生错误
        console.error('  - 错误: 请求设置失败。')
        console.error('  - 详情:', axiosError.message)
      }
    }
    else {
      // 其他未知错误
      console.error('  - 发生未知错误:', error.message || error)
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
    (yargs) => {
      return yargs.option('rssi', {
        describe: '信号强度 (RSSI) 阈值，只扫描此值以上的设备',
        type: 'number',
      })
    },
    async (argv) => {
      console.log('Sending [start] command...')
      const data: { rssi?: number } = {}
      if (argv.rssi !== undefined) {
        data.rssi = argv.rssi
        console.log(`  - 使用 RSSI 阈值: >= ${argv.rssi}`)
      }
      await sendCommand(CommandCode.START, data)
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
      es.onerror = (err: ErrorEvent) => {
        if (err.type === 'error' && (err as any).status === 404) {
          console.error('❌ 找不到服务器。主应用程序 (src/index.ts) 是否正在运行？')
        }
        else {
          console.error('❌ EventSource 错误:', err)
        }
        es.close()
      }
    },
  )
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .parse()
