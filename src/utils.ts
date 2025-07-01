import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getFormattedDateTimeWithMilliseconds() {
  const now = new Date()

  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const seconds = now.getSeconds().toString().padStart(2, '0')
  const milliseconds = now.getMilliseconds().toString().padStart(3, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
}

// 获取项目根目录
export function getProjectRoot(): string {
  // 在 ES module 中获取当前文件的目录
  const currentFileUrl = import.meta.url
  const currentFilePath = fileURLToPath(currentFileUrl)
  const currentDir = path.dirname(currentFilePath)

  // 从当前文件目录向上查找项目根目录（包含 package.json 的目录）
  let projectRoot = currentDir
  while (projectRoot !== path.dirname(projectRoot)) {
    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
      break
    }
    projectRoot = path.dirname(projectRoot)
  }

  return projectRoot
}
