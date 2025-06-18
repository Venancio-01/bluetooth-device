import process from 'process'
import { AppController } from './app-controller'
import { getLogger } from './logger'

const logger = getLogger()
let appController: AppController | null = null

/**
 * 应用程序主函数
 */
async function main(): Promise<void> {
  try {
    logger.info('Main', '正在启动蓝牙设备检测系统...')

    // 创建应用控制器
    appController = new AppController()

    // 初始化应用程序
    await appController.initialize()

    logger.info('Main', '蓝牙设备检测系统启动成功')
  }
  catch (error) {
    logger.error('Main', '启动失败:', error)
    process.exit(1)
  }
}

/**
 * 处理进程信号，优雅关闭应用程序
 */
process.on('SIGINT', async () => {
  logger.info('Main', '\n正在关闭程序...')
  try {
    if (appController) {
      await appController.shutdown()
    }
    logger.info('Main', '程序已安全关闭')
  }
  catch (error) {
    logger.error('Main', '关闭程序时发生错误:', error)
  }
  process.exit()
})

// 启动应用程序
main()
