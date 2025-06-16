// src/index.ts
import process from "process";

// src/blue-device.ts
import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

// src/protocol.ts
var AT_COMMAND_SUFFIX = "\r\n";
var AT_COMMAND_PREFIX = "AT";
var AT_COMMAND_MODE = "+++";
var AT_RESTART = "RESTART";
var AT_ROLE = "ROLE=1";
var AT_OBSERVER = "OBSERVER=1,4,,,";
function buildEnterCommandMode() {
  return `${AT_COMMAND_MODE}`;
}
function buildRestartCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_RESTART}${AT_COMMAND_SUFFIX}`;
}
function buildRoleCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_ROLE}${AT_COMMAND_SUFFIX}`;
}
function buildObserverCommand(rssi = 60) {
  const defaultRssi = `-${rssi}`;
  return `${AT_COMMAND_PREFIX}+${AT_OBSERVER}${defaultRssi}${AT_COMMAND_SUFFIX}`;
}

// src/utils.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/blue-device.ts
var MANUFACTURER_DICT = {
  "0001": "Nokia Mobile Phones",
  // '0006': 'Microsoft',
  "0008": "Motorola",
  "004C": "Apple, Inc.",
  "0056": "Sony Ericsson Mobile Communications",
  "0075": "Samsung Electronics Co. Ltd.",
  "00C4": "LG Electronics",
  "00EO": "Google"
};
var BlueDevice = class {
  port = null;
  isInitialized = false;
  constructor() {
    this.port = null;
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: "/dev/ttyUSB0",
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        autoOpen: false
      }, (err) => {
        if (err) {
          reject(err);
        }
      });
      const parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
      this.port.on("open", () => {
        resolve(this.port);
      });
      this.port.on("error", (err) => {
        reject(err);
      });
      this.port.on("close", () => {
        reject(new Error("\u4E32\u53E3\u5173\u95ED"));
      });
      parser.on("data", (data) => {
        console.log(data);
      });
      this.port.open();
    });
  }
  async disconnect() {
    this.port?.close();
  }
  async send(data) {
    console.log("\u53D1\u9001\u6570\u636E:", data);
    this.port?.write(data, (err) => {
      if (err) {
        console.error("\u53D1\u9001\u6570\u636E\u65F6\u51FA\u9519:", err.message);
      }
    });
  }
  async parseData(data) {
    const advStr = data.split(",")?.[2]?.split(":")?.[1];
    if (!advStr) {
      return;
    }
    const splitStr = advStr.substring(14, 16);
    if (splitStr === "FF") {
      const targetStr = advStr.substring(18, 20) + advStr.substring(16, 18);
      const manufacturer = MANUFACTURER_DICT[targetStr];
      console.log(manufacturer);
    }
  }
  async sendAndSleep(data, sleepTime) {
    await this.send(data);
    await sleep(sleepTime);
  }
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    await this.sendAndSleep(buildRestartCommand(), 1e3);
    await this.sendAndSleep(buildEnterCommandMode(), 1e3);
    await this.sendAndSleep(buildRoleCommand(), 1e3);
    await this.sendAndSleep(buildRestartCommand(), 3e3);
    await this.sendAndSleep(buildEnterCommandMode(), 2e3);
    this.isInitialized = true;
  }
  async scan() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    await this.sendAndSleep(buildObserverCommand(), 0);
  }
};

// src/index.ts
var blueDevice = null;
async function main() {
  blueDevice = new BlueDevice();
  try {
    await blueDevice.connect();
    console.log("\u84DD\u7259\u6A21\u5757\u8FDE\u63A5\u6210\u529F");
  } catch (error) {
    console.error(error);
  }
  try {
    await blueDevice.initialize();
    console.log("\u84DD\u7259\u6A21\u5757\u521D\u59CB\u5316\u5B8C\u6210");
  } catch (error) {
    console.error(error);
  }
  try {
    await blueDevice.scan();
    console.log("\u542F\u52A8\u626B\u63CF");
  } catch (error) {
    console.error(error);
  }
}
process.on("SIGINT", () => {
  console.log("\n\u68C0\u6D4B\u5230 SIGINT\uFF0C\u6B63\u5728\u5173\u95ED\u4E32\u53E3...");
  blueDevice?.disconnect();
  process.exit();
});
main();
//# sourceMappingURL=index.js.map