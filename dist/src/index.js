// src/index.ts
import process from "process";

// src/blue-device.ts
import { EventEmitter } from "events";
import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

// src/protocol.ts
var AT_COMMAND_SUFFIX = "\r\n";
var AT_COMMAND_PREFIX = "AT";
var AT_COMMAND_MODE = "+++";
var AT_RESTART = "RESTART";
var AT_SET_ROLE = "ROLE=1";
var AT_START_OBSERVER = "OBSERVER=1,4,,,";
var AT_STOP_OBSERVER = "OBSERVER=0";
function buildEnterCommandMode() {
  return `${AT_COMMAND_MODE}`;
}
function buildRestartCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_RESTART}${AT_COMMAND_SUFFIX}`;
}
function buildSetRoleCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_SET_ROLE}${AT_COMMAND_SUFFIX}`;
}
function buildObserverCommand(rssi = "-60") {
  return `${AT_COMMAND_PREFIX}+${AT_START_OBSERVER}${rssi}${AT_COMMAND_SUFFIX}`;
}
function buildStopObserverCommand() {
  return `${AT_COMMAND_PREFIX}+${AT_STOP_OBSERVER}${AT_COMMAND_SUFFIX}`;
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
var BlueDevice = class extends EventEmitter {
  port = null;
  initializeState = "uninitialized";
  isScanning = false;
  deleteDeviceList = /* @__PURE__ */ new Set();
  constructor() {
    super();
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
        console.log("\u63A5\u6536\u6570\u636E:", data);
        this.parseData(data);
      });
      this.port.open();
    });
  }
  async disconnect() {
    await this.stopScan();
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
    const splitStrIndex = advStr.indexOf("FF");
    const splitStr = advStr.substring(splitStrIndex, splitStrIndex + 2);
    if (splitStr === "FF") {
      const targetStr = advStr.substring(splitStrIndex + 4, splitStrIndex + 6) + advStr.substring(splitStrIndex + 2, splitStrIndex + 4);
      const manufacturer = MANUFACTURER_DICT[targetStr];
      if (manufacturer) {
        const hasDevice = this.deleteDeviceList.has(targetStr);
        if (!hasDevice) {
          console.log("manufacturer", manufacturer);
          this.emit("device", { mf: manufacturer });
          this.deleteDeviceList.add(targetStr);
        }
      }
    }
  }
  /**
   * 发送数据并等待
   * @param data 数据
   * @param sleepTime 等待时间
   */
  async sendAndSleep(data, sleepTime = 0) {
    await this.send(data);
    await sleep(sleepTime);
    this.initializeState = "initialized";
  }
  async initialize() {
    if (this.initializeState === "initializing" || this.initializeState === "initialized") {
      return;
    }
    this.initializeState = "initializing";
    await this.sendAndSleep(buildRestartCommand(), 1e3);
    await this.sendAndSleep(buildEnterCommandMode(), 1e3);
    await this.sendAndSleep(buildSetRoleCommand(), 1e3);
    await this.sendAndSleep(buildRestartCommand(), 3e3);
    await this.sendAndSleep(buildEnterCommandMode(), 2e3);
    this.initializeState = "initialized";
  }
  async startScan(rssi = "-60") {
    if (this.initializeState === "uninitialized") {
      await this.initialize();
    }
    if (this.initializeState === "initializing") {
      console.log("\u8BBE\u5907\u521D\u59CB\u5316\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
      return;
    }
    this.deleteDeviceList.clear();
    this.isScanning = true;
    await this.sendAndSleep(buildObserverCommand(rssi));
  }
  async stopScan() {
    if (!this.isScanning) {
      return;
    }
    await this.sendAndSleep(buildStopObserverCommand());
    this.isScanning = false;
  }
  /**
   * 重启设备
   */
  async restart() {
    await this.sendAndSleep(buildRestartCommand());
  }
};

// src/communication.ts
import { z } from "zod";
var CommandCode = {
  START: 1,
  HEARTBEAT: 2,
  STOP: 3
};
var EventTypeCode = {
  STATUS: 1,
  ERROR: 2,
  DEVICE: 3
};
var RequestSchema = z.object({
  c: z.nativeEnum(CommandCode),
  d: z.record(z.unknown()).optional()
});
var ResponseSchema = z.object({
  t: z.nativeEnum(EventTypeCode),
  d: z.record(z.unknown())
});
function createStatusResponse(data) {
  const payload = {
    t: EventTypeCode.STATUS,
    d: data
  };
  return JSON.stringify(payload);
}
function createErrorResponse(data) {
  const payload = {
    t: EventTypeCode.ERROR,
    d: data
  };
  return JSON.stringify(payload);
}
function createDeviceEvent(data) {
  const payload = {
    t: EventTypeCode.DEVICE,
    d: data
  };
  return JSON.stringify(payload);
}

// src/http-transport.ts
import { EventEmitter as EventEmitter2 } from "events";
import express from "express";
var HttpTransport = class extends EventEmitter2 {
  server = null;
  sseClients = [];
  port;
  app;
  constructor(port = 8888) {
    super();
    this.port = port;
    this.app = express();
    this.setupRoutes();
  }
  start = async () => {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`HTTP server listening on http://0.0.0.0:${this.port}`);
        resolve();
      });
    });
  };
  stop = async () => {
    return new Promise((resolve) => {
      this.sseClients.forEach((res) => res.end());
      this.sseClients = [];
      if (this.server) {
        this.server.close(() => {
          console.log("HTTP server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  };
  send = (data) => {
    console.log(`Sending event to ${this.sseClients.length} clients`);
    this.sseClients.forEach((res) => {
      res.write(`data: ${data}

`);
    });
  };
  setupRoutes = () => {
    this.app.post("/command", express.json(), (req, res) => {
      try {
        const cb = (response) => {
          res.status(200).send(response);
        };
        this.emit("data", req.body, cb);
      } catch (error) {
        res.status(500).send({ error: "Internal Server Error", message: error.message });
      }
    });
    this.app.get("/events", this.setupSse);
  };
  setupSse = (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.write("\n");
    this.sseClients.push(res);
    console.log("SSE client connected");
    res.on("close", () => {
      this.sseClients = this.sseClients.filter((client) => client !== res);
      console.log("SSE client disconnected");
    });
  };
};

// src/index.ts
var blueDevice = null;
var transport = null;
async function handleMessage(message, cb) {
  const request = message;
  if (!request) {
    const errorResponse = createErrorResponse({ msg: "Invalid message format" });
    return cb(errorResponse);
  }
  try {
    switch (request.c) {
      case CommandCode.HEARTBEAT:
        return cb(onReviceHeartbeat());
      case CommandCode.START:
        return cb(await onReviceStart(request.d?.["rssi"] || "-60"));
      case CommandCode.STOP:
        return cb(await onReviceStop());
      default:
        return cb(createErrorResponse({ msg: "Unknown command" }));
    }
  } catch (error) {
    console.error("\u5904\u7406\u6307\u4EE4\u65F6\u53D1\u751F\u9519\u8BEF:", error);
    return cb(createErrorResponse({ msg: error.message || "Failed to execute command" }));
  }
}
async function main() {
  blueDevice = new BlueDevice();
  transport = new HttpTransport();
  transport.on("data", (message, cb) => {
    handleMessage(message, cb);
  });
  blueDevice.on("device", (device) => {
    console.log("\u8BBE\u5907\u4E0A\u62A5:", device);
    const event = createDeviceEvent(device);
    transport?.send(event);
  });
  try {
    await blueDevice.connect();
    console.log("\u84DD\u7259\u6A21\u5757\u8FDE\u63A5\u6210\u529F");
    await transport.start();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
  try {
    await blueDevice.initialize();
    console.log("\u84DD\u7259\u6A21\u5757\u521D\u59CB\u5316\u5B8C\u6210");
  } catch (error) {
    console.error(error);
  }
}
function onReviceHeartbeat() {
  console.log("\u6536\u5230\u5FC3\u8DF3\u6307\u4EE4");
  return createStatusResponse({ run: true });
}
async function onReviceStart(rssi = "-60") {
  console.log("\u6536\u5230\u542F\u52A8\u626B\u63CF\u6307\u4EE4", rssi);
  await blueDevice?.startScan(rssi);
  return createStatusResponse({ msg: "Scan started" });
}
async function onReviceStop() {
  console.log("\u6536\u5230\u505C\u6B62\u626B\u63CF\u6307\u4EE4");
  await blueDevice?.stopScan();
  return createStatusResponse({ msg: "Scan stopped" });
}
process.on("SIGINT", () => {
  console.log("\n\u6B63\u5728\u5173\u95ED\u7A0B\u5E8F...");
  blueDevice?.disconnect();
  transport?.stop();
  process.exit();
});
main();
//# sourceMappingURL=index.js.map