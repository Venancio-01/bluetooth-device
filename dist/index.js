// src/index.ts
import process2 from "process";

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
var RequestDataSchema = z.object({
  rssi: z.string().optional(),
  did: z.string().optional()
  // 设备ID，用于指定特定设备
}).passthrough();
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
    d: {
      ...data,
      // 确保设备标识字段使用缩写
      did: data["deviceId"] || data["did"],
      sp: data["serialPath"] || data["sp"]
    }
  };
  if (payload.d["deviceId"]) delete payload.d["deviceId"];
  if (payload.d["serialPath"]) delete payload.d["serialPath"];
  return JSON.stringify(payload);
}
function parseRequestData(data) {
  try {
    const validation = RequestDataSchema.safeParse(data);
    if (validation.success) {
      return validation.data;
    }
    console.error("Invalid request data format:", validation.error);
    return null;
  } catch (error) {
    console.error("Failed to parse request data:", error);
    return null;
  }
}

// src/config.ts
import fs from "fs";
import path from "path";
import process from "process";
import { z as z2 } from "zod";
var DeviceConfigSchema = z2.object({
  serialPath: z2.string(),
  deviceId: z2.string().optional(),
  baudRate: z2.number().optional().default(115200),
  enabled: z2.boolean().optional().default(true)
});
var AppConfigSchema = z2.object({
  devices: z2.array(DeviceConfigSchema),
  transport: z2.object({
    type: z2.enum(["http"]).default("http"),
    port: z2.number().optional().default(8888)
  }).optional().default({ type: "http", port: 8888 }),
  logging: z2.object({
    level: z2.enum(["debug", "info", "warn", "error"]).optional().default("info"),
    enableDevicePrefix: z2.boolean().optional().default(true)
  }).optional().default({ level: "info", enableDevicePrefix: true })
});
var DEFAULT_CONFIG = {
  devices: [
    {
      serialPath: "/dev/ttyUSB0",
      deviceId: "device_0",
      baudRate: 115200,
      enabled: true
    }
  ],
  transport: {
    type: "http",
    port: 8888
  },
  logging: {
    level: "info",
    enableDevicePrefix: true
  }
};
var ConfigManager = class {
  config;
  configPath;
  constructor(configPath) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfig();
  }
  /**
   * 获取默认配置文件路径
   */
  getDefaultConfigPath() {
    if (process.env["CONFIG_PATH"]) {
      return process.env["CONFIG_PATH"];
    }
    return path.join(process.cwd(), "config.json");
  }
  /**
   * 加载配置
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, "utf-8");
        const jsonConfig = JSON.parse(configContent);
        const validatedConfig = AppConfigSchema.parse(jsonConfig);
        console.log(`[ConfigManager] \u4ECE\u914D\u7F6E\u6587\u4EF6\u52A0\u8F7D\u914D\u7F6E: ${this.configPath}`);
        return validatedConfig;
      }
      console.log("[ConfigManager] \u672A\u627E\u5230\u914D\u7F6E\u6587\u4EF6\uFF0C\u521B\u5EFA\u9ED8\u8BA4\u914D\u7F6E");
      this.saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    } catch (error) {
      console.error("[ConfigManager] \u52A0\u8F7D\u914D\u7F6E\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E:", error);
      return DEFAULT_CONFIG;
    }
  }
  /**
   * 保存配置到文件
   */
  saveConfig(config) {
    try {
      const configContent = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, configContent, "utf-8");
      console.log(`[ConfigManager] \u914D\u7F6E\u5DF2\u4FDD\u5B58\u5230: ${this.configPath}`);
    } catch (error) {
      console.error("[ConfigManager] \u4FDD\u5B58\u914D\u7F6E\u5931\u8D25:", error);
    }
  }
  /**
   * 获取完整配置
   */
  getConfig() {
    return this.config;
  }
  /**
   * 获取设备配置列表
   */
  getDeviceConfigs() {
    return this.config.devices.filter((device) => device.enabled).map((device) => ({
      serialPath: device.serialPath,
      deviceId: device.deviceId || ""
    }));
  }
  /**
   * 获取传输层配置
   */
  getTransportConfig() {
    return this.config.transport;
  }
  /**
   * 获取日志配置
   */
  getLoggingConfig() {
    return this.config.logging;
  }
  /**
   * 添加设备配置
   */
  addDevice(deviceConfig) {
    this.config.devices.push(deviceConfig);
    this.saveConfig(this.config);
  }
  /**
   * 移除设备配置
   */
  removeDevice(serialPath) {
    const initialLength = this.config.devices.length;
    this.config.devices = this.config.devices.filter((device) => device.serialPath !== serialPath);
    if (this.config.devices.length < initialLength) {
      this.saveConfig(this.config);
      return true;
    }
    return false;
  }
  /**
   * 启用/禁用设备
   */
  setDeviceEnabled(serialPath, enabled) {
    const device = this.config.devices.find((d) => d.serialPath === serialPath);
    if (device) {
      device.enabled = enabled;
      this.saveConfig(this.config);
      return true;
    }
    return false;
  }
  /**
   * 重新加载配置
   */
  reload() {
    this.config = this.loadConfig();
  }
  /**
   * 验证配置
   */
  validate() {
    const errors = [];
    const enabledDevices = this.config.devices.filter((d) => d.enabled);
    if (enabledDevices.length === 0) {
      errors.push("\u81F3\u5C11\u9700\u8981\u542F\u7528\u4E00\u4E2A\u8BBE\u5907");
    }
    const serialPaths = enabledDevices.map((d) => d.serialPath);
    const duplicates = serialPaths.filter((path2, index) => serialPaths.indexOf(path2) !== index);
    if (duplicates.length > 0) {
      errors.push(`\u4E32\u53E3\u8DEF\u5F84\u91CD\u590D: ${duplicates.join(", ")}`);
    }
    const deviceIds = enabledDevices.map((d) => d.deviceId).filter(Boolean);
    const duplicateIds = deviceIds.filter((id, index) => deviceIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`\u8BBE\u5907ID\u91CD\u590D: ${duplicateIds.join(", ")}`);
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
var configManager = null;
function getConfigManager(configPath) {
  if (!configManager) {
    configManager = new ConfigManager(configPath);
  }
  return configManager;
}

// src/device-manager.ts
import { EventEmitter as EventEmitter2 } from "events";

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
  serialPath;
  deviceId;
  constructor(serialPath = "/dev/ttyUSB0", deviceId) {
    super();
    this.port = null;
    this.serialPath = serialPath;
    this.deviceId = deviceId || serialPath.replace(/[^a-z0-9]/gi, "_");
  }
  /**
   * 获取设备ID
   */
  getDeviceId() {
    return this.deviceId;
  }
  /**
   * 获取串口路径
   */
  getSerialPath() {
    return this.serialPath;
  }
  /**
   * 获取设备状态
   */
  getStatus() {
    return {
      deviceId: this.deviceId,
      serialPath: this.serialPath,
      connected: this.port !== null,
      initializeState: this.initializeState,
      isScanning: this.isScanning
    };
  }
  /**
   * 检查是否正在扫描
   */
  isCurrentlyScanning() {
    return this.isScanning;
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.serialPath,
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
        console.error(`[${this.deviceId}] \u4E32\u53E3\u9519\u8BEF:`, err);
        this.emit("error", err);
        reject(err);
      });
      this.port.on("close", () => {
        console.warn(`[${this.deviceId}] \u4E32\u53E3\u8FDE\u63A5\u5173\u95ED`);
        this.emit("disconnected", { deviceId: this.deviceId, serialPath: this.serialPath });
        reject(new Error("\u4E32\u53E3\u5173\u95ED"));
      });
      parser.on("data", (data) => {
        console.log(`[${this.deviceId}] \u63A5\u6536\u6570\u636E:`, data);
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
    console.log(`[${this.deviceId}] \u53D1\u9001\u6570\u636E:`, data);
    return new Promise((resolve, reject) => {
      if (!this.port) {
        const error = new Error("\u4E32\u53E3\u672A\u8FDE\u63A5");
        console.error(`[${this.deviceId}] \u53D1\u9001\u6570\u636E\u5931\u8D25:`, error.message);
        this.emit("error", error);
        reject(error);
        return;
      }
      this.port.write(data, (err) => {
        if (err) {
          console.error(`[${this.deviceId}] \u53D1\u9001\u6570\u636E\u65F6\u51FA\u9519:`, err.message);
          this.emit("error", err);
          reject(err);
        } else {
          resolve();
        }
      });
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
          console.log(`[${this.deviceId}] manufacturer`, manufacturer);
          this.emit("device", {
            mf: manufacturer,
            deviceId: this.deviceId,
            serialPath: this.serialPath
          });
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
    try {
      await this.send(data);
      if (sleepTime > 0) {
        await sleep(sleepTime);
      }
    } catch (error) {
      console.error(`[${this.deviceId}] \u53D1\u9001\u6307\u4EE4\u5931\u8D25:`, error);
      throw error;
    }
  }
  async initialize() {
    if (this.initializeState === "initializing" || this.initializeState === "initialized") {
      return;
    }
    console.log(`[${this.deviceId}] \u5F00\u59CB\u521D\u59CB\u5316\u8BBE\u5907`);
    this.initializeState = "initializing";
    try {
      await this.sendAndSleep(buildRestartCommand(), 1e3);
      await this.sendAndSleep(buildEnterCommandMode(), 1e3);
      await this.sendAndSleep(buildSetRoleCommand(), 1e3);
      await this.sendAndSleep(buildRestartCommand(), 3e3);
      await this.sendAndSleep(buildEnterCommandMode(), 2e3);
      this.initializeState = "initialized";
      console.log(`[${this.deviceId}] \u8BBE\u5907\u521D\u59CB\u5316\u5B8C\u6210`);
    } catch (error) {
      this.initializeState = "uninitialized";
      console.error(`[${this.deviceId}] \u8BBE\u5907\u521D\u59CB\u5316\u5931\u8D25:`, error);
      this.emit("error", error);
      throw error;
    }
  }
  async startScan(rssi = "-60") {
    try {
      if (this.initializeState === "uninitialized") {
        await this.initialize();
      }
      if (this.initializeState === "initializing") {
        console.log(`[${this.deviceId}] \u8BBE\u5907\u521D\u59CB\u5316\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5`);
        throw new Error("\u8BBE\u5907\u521D\u59CB\u5316\u4E2D");
      }
      if (this.isScanning) {
        console.log(`[${this.deviceId}] \u8BBE\u5907\u5DF2\u5728\u626B\u63CF\u4E2D`);
        return;
      }
      console.log(`[${this.deviceId}] \u5F00\u59CB\u626B\u63CF\uFF0CRSSI\u9608\u503C: ${rssi}`);
      this.deleteDeviceList.clear();
      this.isScanning = true;
      await this.sendAndSleep(buildObserverCommand(rssi));
      console.log(`[${this.deviceId}] \u626B\u63CF\u5DF2\u542F\u52A8`);
    } catch (error) {
      this.isScanning = false;
      console.error(`[${this.deviceId}] \u542F\u52A8\u626B\u63CF\u5931\u8D25:`, error);
      this.emit("error", error);
      throw error;
    }
  }
  async stopScan() {
    try {
      if (!this.isScanning) {
        console.log(`[${this.deviceId}] \u8BBE\u5907\u672A\u5728\u626B\u63CF\u4E2D`);
        return;
      }
      console.log(`[${this.deviceId}] \u505C\u6B62\u626B\u63CF`);
      await this.sendAndSleep(buildStopObserverCommand());
      this.isScanning = false;
      console.log(`[${this.deviceId}] \u626B\u63CF\u5DF2\u505C\u6B62`);
    } catch (error) {
      console.error(`[${this.deviceId}] \u505C\u6B62\u626B\u63CF\u5931\u8D25:`, error);
      this.emit("error", error);
      throw error;
    }
  }
  /**
   * 重启设备
   */
  async restart() {
    await this.sendAndSleep(buildRestartCommand());
  }
};

// src/device-manager.ts
var DeviceManager = class extends EventEmitter2 {
  devices = /* @__PURE__ */ new Map();
  deviceConfigs = [];
  reconnectTimers = /* @__PURE__ */ new Map();
  reconnectAttempts = /* @__PURE__ */ new Map();
  maxReconnectAttempts = 5;
  reconnectDelay = 1e4;
  // 10秒
  constructor(deviceConfigs = []) {
    super();
    this.deviceConfigs = deviceConfigs;
  }
  /**
   * 添加设备配置
   */
  addDeviceConfig(config) {
    this.deviceConfigs.push(config);
  }
  /**
   * 获取所有设备配置
   */
  getDeviceConfigs() {
    return [...this.deviceConfigs];
  }
  /**
   * 初始化所有设备
   */
  async initializeDevices() {
    const initPromises = this.deviceConfigs.map((config) => this.initializeDevice(config));
    const results = await Promise.allSettled(initPromises);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const config = this.deviceConfigs[index];
        console.error(`[DeviceManager] \u8BBE\u5907 ${config?.deviceId || config?.serialPath} \u521D\u59CB\u5316\u5931\u8D25:`, result.reason);
      }
    });
  }
  /**
   * 初始化单个设备
   */
  async initializeDevice(config) {
    const device = new BlueDevice(config.serialPath, config.deviceId);
    const deviceId = device.getDeviceId();
    device.on("device", (deviceData) => {
      console.log(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u4E0A\u62A5:`, deviceData);
      this.emit("device", {
        ...deviceData,
        sourceDeviceId: deviceId,
        sourceSerialPath: device.getSerialPath()
      });
    });
    device.on("error", (error) => {
      console.error(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u9519\u8BEF:`, error);
      this.emit("deviceError", {
        deviceId,
        serialPath: device.getSerialPath(),
        error
      });
    });
    device.on("disconnected", () => {
      console.warn(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u65AD\u5F00\u8FDE\u63A5`);
      this.devices.delete(deviceId);
      this.emit("deviceDisconnected", {
        deviceId,
        serialPath: device.getSerialPath()
      });
      this.scheduleReconnect(config, deviceId);
    });
    try {
      await device.connect();
      console.log(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u8FDE\u63A5\u6210\u529F`);
      await device.initialize();
      console.log(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u521D\u59CB\u5316\u5B8C\u6210`);
      this.devices.set(deviceId, device);
      this.emit("deviceConnected", {
        deviceId,
        serialPath: device.getSerialPath()
      });
    } catch (error) {
      console.error(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u8FDE\u63A5\u6216\u521D\u59CB\u5316\u5931\u8D25:`, error);
      throw error;
    }
  }
  /**
   * 获取所有设备信息
   */
  getDevicesInfo() {
    return Array.from(this.devices.entries()).map(([deviceId, device]) => {
      const status = device.getStatus();
      return {
        deviceId,
        serialPath: device.getSerialPath(),
        connected: status.connected,
        initialized: status.initializeState === "initialized",
        scanning: status.isScanning
      };
    });
  }
  /**
   * 获取特定设备
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }
  /**
   * 获取所有设备
   */
  getAllDevices() {
    return Array.from(this.devices.values());
  }
  /**
   * 启动扫描 - 支持指定设备或所有设备
   */
  async startScan(rssi = "-60", deviceId) {
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`\u8BBE\u5907 ${deviceId} \u4E0D\u5B58\u5728`);
      }
      await device.startScan(rssi);
      console.log(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u5F00\u59CB\u626B\u63CF`);
    } else {
      const startPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.startScan(rssi);
          console.log(`[DeviceManager] \u8BBE\u5907 ${id} \u5F00\u59CB\u626B\u63CF`);
        } catch (error) {
          console.error(`[DeviceManager] \u8BBE\u5907 ${id} \u542F\u52A8\u626B\u63CF\u5931\u8D25:`, error);
        }
      });
      await Promise.allSettled(startPromises);
    }
  }
  /**
   * 停止扫描 - 支持指定设备或所有设备
   */
  async stopScan(deviceId) {
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`\u8BBE\u5907 ${deviceId} \u4E0D\u5B58\u5728`);
      }
      await device.stopScan();
      console.log(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u505C\u6B62\u626B\u63CF`);
    } else {
      const stopPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.stopScan();
          console.log(`[DeviceManager] \u8BBE\u5907 ${id} \u505C\u6B62\u626B\u63CF`);
        } catch (error) {
          console.error(`[DeviceManager] \u8BBE\u5907 ${id} \u505C\u6B62\u626B\u63CF\u5931\u8D25:`, error);
        }
      });
      await Promise.allSettled(stopPromises);
    }
  }
  /**
   * 断开所有设备连接
   */
  async disconnectAll() {
    this.cancelAllReconnectTimers();
    const disconnectPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
      try {
        await device.disconnect();
        console.log(`[DeviceManager] \u8BBE\u5907 ${id} \u65AD\u5F00\u8FDE\u63A5`);
      } catch (error) {
        console.error(`[DeviceManager] \u8BBE\u5907 ${id} \u65AD\u5F00\u8FDE\u63A5\u5931\u8D25:`, error);
      }
    });
    await Promise.allSettled(disconnectPromises);
    this.devices.clear();
  }
  /**
   * 重新连接失败的设备
   */
  async reconnectFailedDevices() {
    const connectedDeviceIds = new Set(this.devices.keys());
    const failedConfigs = this.deviceConfigs.filter((config) => {
      const deviceId = config.deviceId || config.serialPath.replace(/[^a-z0-9]/gi, "_");
      return !connectedDeviceIds.has(deviceId);
    });
    if (failedConfigs.length > 0) {
      console.log(`[DeviceManager] \u5C1D\u8BD5\u91CD\u65B0\u8FDE\u63A5 ${failedConfigs.length} \u4E2A\u5931\u8D25\u7684\u8BBE\u5907`);
      const reconnectPromises = failedConfigs.map((config) => this.initializeDevice(config));
      await Promise.allSettled(reconnectPromises);
    }
  }
  /**
   * 调度设备重连
   */
  scheduleReconnect(config, deviceId) {
    const attempts = this.reconnectAttempts.get(deviceId) || 0;
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u91CD\u8FDE\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650 (${this.maxReconnectAttempts})\uFF0C\u505C\u6B62\u91CD\u8FDE`);
      this.reconnectAttempts.delete(deviceId);
      return;
    }
    const delay = this.reconnectDelay * 2 ** attempts;
    console.log(`[DeviceManager] \u5C06\u5728 ${delay}ms \u540E\u5C1D\u8BD5\u91CD\u8FDE\u8BBE\u5907 ${deviceId} (\u7B2C ${attempts + 1} \u6B21)`);
    const timer = setTimeout(async () => {
      try {
        console.log(`[DeviceManager] \u5F00\u59CB\u91CD\u8FDE\u8BBE\u5907 ${deviceId}`);
        await this.initializeDevice(config);
        this.reconnectAttempts.delete(deviceId);
        console.log(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u91CD\u8FDE\u6210\u529F`);
      } catch (error) {
        console.error(`[DeviceManager] \u8BBE\u5907 ${deviceId} \u91CD\u8FDE\u5931\u8D25:`, error);
        this.reconnectAttempts.set(deviceId, attempts + 1);
        this.scheduleReconnect(config, deviceId);
      }
      this.reconnectTimers.delete(deviceId);
    }, delay);
    this.reconnectTimers.set(deviceId, timer);
    this.reconnectAttempts.set(deviceId, attempts + 1);
  }
  /**
   * 取消所有重连定时器
   */
  cancelAllReconnectTimers() {
    this.reconnectTimers.forEach((timer, deviceId) => {
      console.log(`[DeviceManager] \u53D6\u6D88\u8BBE\u5907 ${deviceId} \u7684\u91CD\u8FDE\u5B9A\u65F6\u5668`);
      clearTimeout(timer);
    });
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
  }
  /**
   * 获取连接状态统计
   */
  getConnectionStats() {
    return {
      total: this.deviceConfigs.length,
      connected: this.devices.size,
      failed: this.deviceConfigs.length - this.devices.size - this.reconnectTimers.size,
      reconnecting: this.reconnectTimers.size
    };
  }
};

// src/http-transport.ts
import { EventEmitter as EventEmitter3 } from "events";
import express from "express";
var HttpTransport = class extends EventEmitter3 {
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

// src/logger.ts
var Logger = class {
  config;
  constructor(config = {}) {
    this.config = {
      level: config.level ?? 1 /* INFO */,
      enableDevicePrefix: config.enableDevicePrefix ?? true,
      enableTimestamp: config.enableTimestamp ?? true
    };
  }
  formatMessage(level, component, message) {
    const parts = [];
    if (this.config.enableTimestamp) {
      parts.push((/* @__PURE__ */ new Date()).toISOString());
    }
    parts.push(`[${level}]`);
    if (component) {
      parts.push(`[${component}]`);
    }
    parts.push(message);
    return parts.join(" ");
  }
  shouldLog(level) {
    return level >= this.config.level;
  }
  debug(component, message, ...args) {
    if (this.shouldLog(0 /* DEBUG */)) {
      console.debug(this.formatMessage("DEBUG", component, message), ...args);
    }
  }
  info(component, message, ...args) {
    if (this.shouldLog(1 /* INFO */)) {
      console.info(this.formatMessage("INFO", component, message), ...args);
    }
  }
  warn(component, message, ...args) {
    if (this.shouldLog(2 /* WARN */)) {
      console.warn(this.formatMessage("WARN", component, message), ...args);
    }
  }
  error(component, message, ...args) {
    if (this.shouldLog(3 /* ERROR */)) {
      console.error(this.formatMessage("ERROR", component, message), ...args);
    }
  }
  // 设备专用日志方法
  deviceDebug(deviceId, message, ...args) {
    this.debug(deviceId, message, ...args);
  }
  deviceInfo(deviceId, message, ...args) {
    this.info(deviceId, message, ...args);
  }
  deviceWarn(deviceId, message, ...args) {
    this.warn(deviceId, message, ...args);
  }
  deviceError(deviceId, message, ...args) {
    this.error(deviceId, message, ...args);
  }
  // 更新配置
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  // 获取当前配置
  getConfig() {
    return { ...this.config };
  }
};
var globalLogger = null;
function getLogger(config) {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  } else if (config) {
    globalLogger.updateConfig(config);
  }
  return globalLogger;
}
function parseLogLevel(level) {
  switch (level.toLowerCase()) {
    case "debug":
      return 0 /* DEBUG */;
    case "info":
      return 1 /* INFO */;
    case "warn":
    case "warning":
      return 2 /* WARN */;
    case "error":
      return 3 /* ERROR */;
    default:
      return 1 /* INFO */;
  }
}

// src/index.ts
var deviceManager = null;
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
        return cb(onReceiveHeartbeat());
      case CommandCode.START:
        return cb(await onReceiveStart(request.d));
      case CommandCode.STOP:
        return cb(await onReceiveStop(request.d));
      default:
        return cb(createErrorResponse({ msg: "Unknown command" }));
    }
  } catch (error) {
    console.error("\u5904\u7406\u6307\u4EE4\u65F6\u53D1\u751F\u9519\u8BEF:", error);
    return cb(createErrorResponse({ msg: error.message || "Failed to execute command" }));
  }
}
async function main() {
  const configManager2 = getConfigManager();
  const loggingConfig = configManager2.getLoggingConfig();
  const logger = getLogger({
    level: parseLogLevel(loggingConfig.level),
    enableDevicePrefix: loggingConfig.enableDevicePrefix,
    enableTimestamp: true
  });
  const validation = configManager2.validate();
  if (!validation.valid) {
    logger.error("Main", "\u914D\u7F6E\u9A8C\u8BC1\u5931\u8D25:");
    validation.errors.forEach((error) => logger.error("Main", `  - ${error}`));
    process2.exit(1);
  }
  const deviceConfigs = configManager2.getDeviceConfigs();
  if (deviceConfigs.length === 0) {
    logger.error("Main", "\u6CA1\u6709\u542F\u7528\u7684\u8BBE\u5907\u914D\u7F6E");
    process2.exit(1);
  }
  logger.info("Main", `\u52A0\u8F7D\u4E86 ${deviceConfigs.length} \u4E2A\u8BBE\u5907\u914D\u7F6E:`);
  deviceConfigs.forEach((device) => {
    logger.info("Main", `  - ${device.deviceId}: ${device.serialPath}`);
  });
  deviceManager = new DeviceManager(deviceConfigs);
  const transportConfig = configManager2.getTransportConfig();
  transport = new HttpTransport(transportConfig.port);
  transport.on("data", (message, cb) => {
    handleMessage(message, cb);
  });
  deviceManager.on("device", (device) => {
    logger.info("Main", "\u8BBE\u5907\u4E0A\u62A5:", device);
    const event = createDeviceEvent(device);
    transport?.send(event);
  });
  deviceManager.on("deviceConnected", (info) => {
    logger.info("Main", `\u8BBE\u5907 ${info.deviceId} (${info.serialPath}) \u8FDE\u63A5\u6210\u529F`);
  });
  deviceManager.on("deviceDisconnected", (info) => {
    logger.warn("Main", `\u8BBE\u5907 ${info.deviceId} (${info.serialPath}) \u65AD\u5F00\u8FDE\u63A5`);
  });
  deviceManager.on("deviceError", (error) => {
    logger.error("Main", `\u8BBE\u5907 ${error.deviceId} (${error.serialPath}) \u53D1\u751F\u9519\u8BEF:`, error.error);
  });
  try {
    await transport.start();
    logger.info("Main", "\u4F20\u8F93\u5C42\u542F\u52A8\u6210\u529F");
    await deviceManager.initializeDevices();
    const stats = deviceManager.getConnectionStats();
    logger.info("Main", `\u8BBE\u5907\u521D\u59CB\u5316\u5B8C\u6210: ${stats.connected}/${stats.total} \u4E2A\u8BBE\u5907\u8FDE\u63A5\u6210\u529F`);
    if (stats.reconnecting > 0) {
      logger.info("Main", `${stats.reconnecting} \u4E2A\u8BBE\u5907\u6B63\u5728\u91CD\u8FDE\u4E2D`);
    }
    if (stats.connected === 0 && stats.reconnecting === 0) {
      logger.error("Main", "\u6CA1\u6709\u8BBE\u5907\u8FDE\u63A5\u6210\u529F\uFF0C\u7A0B\u5E8F\u9000\u51FA");
      process2.exit(1);
    }
  } catch (error) {
    logger.error("Main", "\u542F\u52A8\u5931\u8D25:", error);
    process2.exit(1);
  }
}
function onReceiveHeartbeat() {
  const logger = getLogger();
  logger.debug("Main", "\u6536\u5230\u5FC3\u8DF3\u6307\u4EE4");
  return createStatusResponse({
    run: true
  });
}
async function onReceiveStart(requestData) {
  const logger = getLogger();
  const data = parseRequestData(requestData);
  const rssi = data?.rssi || "-60";
  const deviceId = data?.did;
  logger.info("Main", "\u6536\u5230\u542F\u52A8\u626B\u63CF\u6307\u4EE4", { rssi, deviceId });
  try {
    await deviceManager?.startScan(rssi, deviceId);
    const message = deviceId ? `\u8BBE\u5907 ${deviceId} \u5F00\u59CB\u626B\u63CF` : "\u6240\u6709\u8BBE\u5907\u5F00\u59CB\u626B\u63CF";
    logger.info("Main", message);
    return createStatusResponse({ msg: message });
  } catch (error) {
    logger.error("Main", "\u542F\u52A8\u626B\u63CF\u5931\u8D25:", error);
    return createErrorResponse({ msg: error.message || "Failed to start scan" });
  }
}
async function onReceiveStop(requestData) {
  const logger = getLogger();
  const data = parseRequestData(requestData);
  const deviceId = data?.did;
  logger.info("Main", "\u6536\u5230\u505C\u6B62\u626B\u63CF\u6307\u4EE4", { deviceId });
  try {
    await deviceManager?.stopScan(deviceId);
    const message = deviceId ? `\u8BBE\u5907 ${deviceId} \u505C\u6B62\u626B\u63CF` : "\u6240\u6709\u8BBE\u5907\u505C\u6B62\u626B\u63CF";
    logger.info("Main", message);
    return createStatusResponse({ msg: message });
  } catch (error) {
    logger.error("Main", "\u505C\u6B62\u626B\u63CF\u5931\u8D25:", error);
    return createErrorResponse({ msg: error.message || "Failed to stop scan" });
  }
}
process2.on("SIGINT", async () => {
  const logger = getLogger();
  logger.info("Main", "\n\u6B63\u5728\u5173\u95ED\u7A0B\u5E8F...");
  try {
    await deviceManager?.disconnectAll();
    await transport?.stop();
    logger.info("Main", "\u7A0B\u5E8F\u5DF2\u5B89\u5168\u5173\u95ED");
  } catch (error) {
    logger.error("Main", "\u5173\u95ED\u7A0B\u5E8F\u65F6\u53D1\u751F\u9519\u8BEF:", error);
  }
  process2.exit();
});
main();
//# sourceMappingURL=index.js.map