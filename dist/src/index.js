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
var AT_ROLE = "ROLE=1";
var AT_START_OBSERVER = "OBSERVER=1,4,,,";
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
  return `${AT_COMMAND_PREFIX}+${AT_START_OBSERVER}${defaultRssi}${AT_COMMAND_SUFFIX}`;
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
        console.log("manufacturer", manufacturer);
        this.emit("device", { mf: manufacturer });
      }
    }
  }
  async sendAndSleep(data, sleepTime) {
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
    await this.sendAndSleep(buildRoleCommand(), 1e3);
    await this.sendAndSleep(buildRestartCommand(), 3e3);
    await this.sendAndSleep(buildEnterCommandMode(), 2e3);
    this.initializeState = "initialized";
  }
  async startScan(rssi = 60) {
    if (this.initializeState === "uninitialized") {
      await this.initialize();
    }
    if (this.initializeState === "initializing") {
      console.log("\u8BBE\u5907\u521D\u59CB\u5316\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
      return;
    }
    this.isScanning = true;
    await this.sendAndSleep(buildObserverCommand(rssi), 0);
  }
  async stopScan() {
    if (!this.isScanning) {
      return;
    }
    await this.sendAndSleep(buildRestartCommand(), 1e3);
    this.isScanning = false;
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
function parseJSONMessage(message) {
  try {
    const json = JSON.parse(message);
    const validation = RequestSchema.safeParse(json);
    if (validation.success) {
      return validation.data;
    }
    console.error("Invalid message format:", validation.error);
    return null;
  } catch (error) {
    console.error("Failed to parse JSON message:", error);
    return null;
  }
}

// src/http-transport.ts
import { EventEmitter as EventEmitter2 } from "events";
import http from "http";
var HttpTransport = class extends EventEmitter2 {
  server = null;
  sseClients = [];
  port;
  constructor(port = 8888) {
    super();
    this.port = port;
  }
  start = async () => {
    this.server = http.createServer(this.handleRequest);
    return new Promise((resolve) => {
      this.server?.listen(this.port, () => {
        console.log(`HTTP server listening on http://localhost:${this.port}`);
        resolve();
      });
    });
  };
  stop = async () => {
    return new Promise((resolve) => {
      this.sseClients.forEach((res) => res.end());
      this.sseClients = [];
      if (this.server?.listening) {
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
  handleRequest = (req, res) => {
    if (req.url === "/command" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        const cb = (response) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(response);
        };
        this.emit("data", body, cb);
      });
    } else if (req.url === "/events" && req.method === "GET") {
      this.setupSse(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  };
  setupSse = (res) => {
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
function handleMessage(message, cb) {
  const request = parseJSONMessage(message);
  if (!request) {
    const errorResponse = createErrorResponse({ msg: "Invalid message format" });
    return cb(errorResponse);
  }
  switch (request.c) {
    case CommandCode.HEARTBEAT:
      console.log("\u6536\u5230\u5FC3\u8DF3\u6307\u4EE4");
      return cb(createStatusResponse({ run: true }));
    case CommandCode.START:
      console.log("\u6536\u5230\u542F\u52A8\u626B\u63CF\u6307\u4EE4");
      blueDevice?.startScan();
      return cb(createStatusResponse({ msg: "Scan started" }));
    case CommandCode.STOP:
      console.log("\u6536\u5230\u505C\u6B62\u626B\u63CF\u6307\u4EE4");
      blueDevice?.stopScan();
      return cb(createStatusResponse({ msg: "Scan stopped" }));
    default:
      return cb(createErrorResponse({ msg: "Unknown command" }));
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
process.on("SIGINT", () => {
  console.log("\n\u6B63\u5728\u5173\u95ED\u7A0B\u5E8F...");
  blueDevice?.disconnect();
  transport?.stop();
  process.exit();
});
main();
//# sourceMappingURL=index.js.map