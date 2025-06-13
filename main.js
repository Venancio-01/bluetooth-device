const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const SERIAL_PORT_PATH = '/dev/ttyUSB0';
const BAUD_RATE = 115200;

let port;

function openSerialPort() {
  port = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  }, (err) => {
    if (err) {
      return console.error('打开串口时出错:', err.message);
    }
    console.log(`串口 ${SERIAL_PORT_PATH} 以 ${BAUD_RATE} 波特率打开成功！`);
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

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
}

function sendData(data) {
  if (port && port.isOpen) {
    port.write(data + '\n', (err) => {
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

// --- 示例使用 ---

openSerialPort();

// 延迟一段时间，等待串口完全打开
setTimeout(() => {
  // 尝试发送一些数据给硬件
  sendData('+++');
}, 2000); // 2秒后开始发送数据

// 在程序退出时关闭串口 (例如，通过 Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n检测到 SIGINT，正在关闭串口...');
  closeSerialPort();
  process.exit();
});
