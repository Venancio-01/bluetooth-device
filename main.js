const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const SERIAL_PORT_PATH = '/dev/ttyUSB0';
const BAUD_RATE = 115200;

const AT_MODE_ENTRY_CMD = '+++'; // 进入 AT 模式的命令，不需要回车换行符
const AT_MODE_ENTRY_RESPONSE = 'OK'; // 进入 AT 模式后模块返回的响应
const QUERY_DEVICE_NAME_CMD = 'AT+NAME?'; // 查询设备名称的 AT 指令
const AT_COMMAND_SUFFIX = '\r\n'; // 所有 AT 命令都必须以回车换行符结尾

let port;

function openSerialPort() {
  port = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false,
  }, (err) => {
    if (err) {
      return console.error('打开串口时出错:', err.message);
    }
    console.log(`串口 ${SERIAL_PORT_PATH} 以 ${BAUD_RATE} 波特率打开成功！`);
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  // 串口打开事件
  port.on('open', () => {
    console.log('串口已成功打开。');

    // 模块上电后需要 600ms 才能正常工作
    // 建议等待至少 1 秒，以确保模块稳定并准备好接收命令。
    setTimeout(() => {
      console.log(`发送 "${AT_MODE_ENTRY_CMD}" 尝试进入 AT 指令模式...`);
      // 发送进入 AT 模式的命令，不带回车换行符
      sendData(AT_MODE_ENTRY_CMD, false);
    }, 1000);
  });

  // 监听数据接收事件
  parser.on('data', data => {
    console.log('收到数据:', data);
    // 在这里处理你的硬件发送过来的数据
  });

  // 监听错误事件
  port.on('error', err => {
    console.error('串口错误:', err.message);
  });

  // 监听串口关闭事件
  port.on('close', () => {
    console.log('串口已关闭');
  });

  // 打开串口
  port.open();
}

function sendData(data, newline = true) {
  if (port && port.isOpen) {
    port.write(data + (newline ? AT_COMMAND_SUFFIX : ''), (err) => {
      if (err) {
        return console.error('发送数据时出错:', err.message);
      }
      console.log('数据发送成功:', data);
    });
  } else {
    console.warn('串口未打开，无法发送数据。');
  }
}

function closeSerialPort() {
  if (port && port.isOpen) {
    port.close((err) => {
      if (err) {
        console.error('关闭串口时出错:', err.message);
      } else {
        console.log('串口已成功关闭。');
      }
    });
  }
}


openSerialPort();

setTimeout(() => {
  sendData(QUERY_DEVICE_NAME_CMD, true);
}, 2000);

process.on('SIGINT', () => {
  console.log('\n检测到 SIGINT，正在关闭串口...');
  closeSerialPort();
  process.exit();
});
