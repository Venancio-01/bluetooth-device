// src/index.ts
import process2 from "process";

// src/app-controller.ts
import { EventEmitter as EventEmitter4 } from "events";

// src/config.ts
import fs from "fs";
import path from "path";
import process from "process";
import { z } from "zod";

// src/utils.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getFormattedDateTimeWithMilliseconds() {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  const milliseconds = now.getMilliseconds().toString().padStart(3, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

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
      parts.push(getFormattedDateTimeWithMilliseconds());
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

// src/config.ts
var logger = getLogger();
var DeviceConfigSchema = z.object({
  serialPath: z.string(),
  deviceId: z.string().optional(),
  baudRate: z.number().optional().default(115200),
  enabled: z.boolean().optional().default(true)
});
var SerialTransportConfigSchema = z.object({
  serialPath: z.string(),
  baudRate: z.number().optional().default(115200),
  dataBits: z.number().optional().default(8),
  stopBits: z.number().optional().default(1),
  parity: z.enum(["none", "even", "odd"]).optional().default("none"),
  timeout: z.number().optional().default(5e3)
  // 超时时间（毫秒）
});
var AppConfigSchema = z.object({
  devices: z.array(DeviceConfigSchema),
  reportInterval: z.number().optional().default(5e3),
  serialTransport: SerialTransportConfigSchema.optional().default({ serialPath: "/dev/ttyUSB0", baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", timeout: 5e3 }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
    enableDevicePrefix: z.boolean().optional().default(true)
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
  reportInterval: 5e3,
  serialTransport: {
    serialPath: "/dev/ttyUSB1",
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    timeout: 5e3
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
        logger.info("ConfigManager", `\u4ECE\u914D\u7F6E\u6587\u4EF6\u52A0\u8F7D\u914D\u7F6E: ${this.configPath}`);
        return validatedConfig;
      }
      logger.info("ConfigManager", "\u672A\u627E\u5230\u914D\u7F6E\u6587\u4EF6\uFF0C\u521B\u5EFA\u9ED8\u8BA4\u914D\u7F6E");
      this.saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    } catch (error) {
      logger.error("ConfigManager", "\u52A0\u8F7D\u914D\u7F6E\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E:", error);
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
      logger.info("ConfigManager", `\u914D\u7F6E\u5DF2\u4FDD\u5B58\u5230: ${this.configPath}`);
    } catch (error) {
      logger.error("ConfigManager", "\u4FDD\u5B58\u914D\u7F6E\u5931\u8D25:", error);
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
    return this.config.serialTransport;
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

// src/blue-device.ts
var logger2 = getLogger();
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
  reportInterval;
  reportTimer = null;
  enableReport = false;
  // 检测结果列表
  detectionResultList = [];
  constructor(serialPath = "/dev/ttyUSB0", deviceId, reportInterval = 5e3) {
    super();
    this.port = null;
    this.serialPath = serialPath;
    this.deviceId = deviceId || serialPath.replace(/[^a-z0-9]/gi, "_");
    this.reportInterval = reportInterval;
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
        logger2.error("BlueDevice", `[${this.deviceId}] \u4E32\u53E3\u9519\u8BEF:`, err);
        this.emit("error", err);
        reject(err);
      });
      this.port.on("close", () => {
        logger2.warn("BlueDevice", `[${this.deviceId}] \u4E32\u53E3\u8FDE\u63A5\u5173\u95ED`);
        this.emit("disconnected", { deviceId: this.deviceId, serialPath: this.serialPath });
        reject(new Error("\u4E32\u53E3\u5173\u95ED"));
      });
      parser.on("data", (data) => {
        logger2.debug("BlueDevice", `[${this.deviceId}] \u63A5\u6536\u6570\u636E:`, data);
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
    logger2.debug("BlueDevice", `[${this.deviceId}] \u53D1\u9001\u6570\u636E:`, data);
    return new Promise((resolve, reject) => {
      if (!this.port) {
        const error = new Error("\u4E32\u53E3\u672A\u8FDE\u63A5");
        logger2.error("BlueDevice", `[${this.deviceId}] \u53D1\u9001\u6570\u636E\u5931\u8D25:`, error.message);
        this.emit("error", error);
        reject(error);
        return;
      }
      this.port.write(data, (err) => {
        if (err) {
          logger2.error("BlueDevice", `[${this.deviceId}] \u53D1\u9001\u6570\u636E\u65F6\u51FA\u9519:`, err.message);
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
    if (splitStr !== "FF") return;
    const targetStr = advStr.substring(splitStrIndex + 4, splitStrIndex + 6) + advStr.substring(splitStrIndex + 2, splitStrIndex + 4);
    const manufacturer = MANUFACTURER_DICT[targetStr];
    if (!manufacturer) return;
    this.addDetectionResult({
      mf: manufacturer,
      timestamp: Date.now()
    });
    const hasDevice = this.deleteDeviceList.has(targetStr);
    if (hasDevice) return;
    if (!this.enableReport) return;
    logger2.info("BlueDevice", `[${this.deviceId}] manufacturer`, manufacturer);
    this.emit("device", {
      mf: manufacturer
    });
    this.deleteDeviceList.add(targetStr);
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
      logger2.error("BlueDevice", `[${this.deviceId}] \u53D1\u9001\u6307\u4EE4\u5931\u8D25:`, error);
      throw error;
    }
  }
  async initialize() {
    if (this.initializeState === "initializing" || this.initializeState === "initialized") {
      return;
    }
    logger2.info("BlueDevice", `[${this.deviceId}] \u5F00\u59CB\u521D\u59CB\u5316\u8BBE\u5907`);
    this.initializeState = "initializing";
    try {
      await this.sendAndSleep(buildRestartCommand(), 3e3);
      await this.sendAndSleep(buildEnterCommandMode(), 500);
      await this.sendAndSleep(buildSetRoleCommand(), 500);
      await this.sendAndSleep(buildRestartCommand(), 2e3);
      await this.sendAndSleep(buildEnterCommandMode(), 1e3);
      this.initializeState = "initialized";
      await this.startScan();
      logger2.info("BlueDevice", `[${this.deviceId}] \u8BBE\u5907\u521D\u59CB\u5316\u5B8C\u6210`);
    } catch (error) {
      this.initializeState = "uninitialized";
      logger2.error("BlueDevice", `[${this.deviceId}] \u8BBE\u5907\u521D\u59CB\u5316\u5931\u8D25:`, error);
      this.emit("error", error);
      throw error;
    }
  }
  async startScan(rssi = "-50") {
    try {
      if (this.initializeState === "uninitialized") {
        await this.initialize();
      }
      if (this.initializeState === "initializing") {
        logger2.error("BlueDevice", `[${this.deviceId}] \u8BBE\u5907\u521D\u59CB\u5316\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5`);
        throw new Error("\u8BBE\u5907\u521D\u59CB\u5316\u4E2D");
      }
      if (this.isScanning) {
        logger2.info("BlueDevice", `[${this.deviceId}] \u8BBE\u5907\u5DF2\u5728\u626B\u63CF\u4E2D`);
        return;
      }
      logger2.info("BlueDevice", `[${this.deviceId}] \u5F00\u59CB\u626B\u63CF\uFF0CRSSI\u9608\u503C: ${rssi}`);
      this.isScanning = true;
      this.startReportTimer();
      await this.sendAndSleep(buildObserverCommand(rssi));
      logger2.info("BlueDevice", `[${this.deviceId}] \u626B\u63CF\u5DF2\u542F\u52A8`);
    } catch (error) {
      this.isScanning = false;
      logger2.error("BlueDevice", `[${this.deviceId}] \u542F\u52A8\u626B\u63CF\u5931\u8D25:`, error);
      this.emit("error", error);
      throw error;
    }
  }
  async stopScan() {
    try {
      if (!this.isScanning) {
        logger2.info("BlueDevice", `[${this.deviceId}] \u8BBE\u5907\u672A\u5728\u626B\u63CF\u4E2D`);
        return;
      }
      logger2.info("BlueDevice", `[${this.deviceId}] \u505C\u6B62\u626B\u63CF`);
      await this.sendAndSleep(buildStopObserverCommand());
      this.isScanning = false;
      logger2.info("BlueDevice", `[${this.deviceId}] \u626B\u63CF\u5DF2\u505C\u6B62`);
      this.stopReportTimer();
    } catch (error) {
      logger2.error("BlueDevice", `[${this.deviceId}] \u505C\u6B62\u626B\u63CF\u5931\u8D25:`, error);
      this.emit("error", error);
      throw error;
    }
  }
  async startReport() {
    this.enableReport = true;
    const manufacturer = [...new Set(this.detectionResultList.map((item) => item.mf))].join(",");
    if (!manufacturer) return;
    logger2.info("BlueDevice", `[${this.deviceId}] \u7F13\u51B2\u533A\u68C0\u6D4B\u7ED3\u679C:`, manufacturer);
    this.emit("device", {
      mf: manufacturer
    });
  }
  async stopReport() {
    this.enableReport = false;
  }
  addDetectionResult(result) {
    const maxRetentionTime = 1e3;
    this.detectionResultList = this.detectionResultList.filter((item) => Date.now() - item.timestamp < maxRetentionTime);
    this.detectionResultList.push(result);
  }
  /**
   * 重启设备
   */
  async restart() {
    await this.sendAndSleep(buildRestartCommand());
  }
  // 启动定时清除已检测设备
  startReportTimer() {
    this.deleteDeviceList.clear();
    this.reportTimer = setInterval(() => {
      this.deleteDeviceList.clear();
    }, this.reportInterval);
  }
  // 停止定时清除已检测设备
  stopReportTimer() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
  }
};

// src/device-manager.ts
var logger3 = getLogger();
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
        logger3.error("DeviceManager", `[${config?.deviceId || config?.serialPath}] \u521D\u59CB\u5316\u5931\u8D25:`, result.reason);
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
      logger3.info("DeviceManager", `[${deviceId}] \u4E0A\u62A5:`, deviceData);
      this.emit("device", deviceData);
    });
    device.on("error", (error) => {
      logger3.error("DeviceManager", `[${deviceId}] \u9519\u8BEF:`, error);
      this.emit("deviceError", {
        deviceId,
        serialPath: device.getSerialPath(),
        error
      });
    });
    device.on("disconnected", () => {
      logger3.warn("DeviceManager", `[${deviceId}] \u65AD\u5F00\u8FDE\u63A5`);
      this.devices.delete(deviceId);
      this.emit("deviceDisconnected", {
        deviceId,
        serialPath: device.getSerialPath()
      });
      this.scheduleReconnect(config, deviceId);
    });
    try {
      await device.connect();
      logger3.info("DeviceManager", `[${deviceId}] \u8FDE\u63A5\u6210\u529F`);
      await device.initialize();
      logger3.info("DeviceManager", `[${deviceId}] \u521D\u59CB\u5316\u5B8C\u6210`);
      this.devices.set(deviceId, device);
      this.emit("deviceConnected", {
        deviceId,
        serialPath: device.getSerialPath()
      });
    } catch (error) {
      logger3.error("DeviceManager", `[${deviceId}] \u8FDE\u63A5\u6216\u521D\u59CB\u5316\u5931\u8D25:`, error);
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
      logger3.info("DeviceManager", `[${deviceId}] \u5F00\u59CB\u4E0A\u62A5`);
    } else {
      const startPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.startScan(rssi);
          logger3.info("DeviceManager", `[${id}] \u5F00\u59CB\u626B\u63CF`);
        } catch (error) {
          logger3.error("DeviceManager", `[${id}] \u542F\u52A8\u626B\u63CF\u5931\u8D25:`, error);
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
      logger3.info("DeviceManager", `[${deviceId}] \u505C\u6B62\u626B\u63CF`);
    } else {
      const stopPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.stopScan();
          logger3.info("DeviceManager", `[${id}] \u505C\u6B62\u626B\u63CF`);
        } catch (error) {
          logger3.error("DeviceManager", `[${id}] \u505C\u6B62\u626B\u63CF\u5931\u8D25:`, error);
        }
      });
      await Promise.allSettled(stopPromises);
    }
  }
  /**
   * 启动上报 - 支持指定设备或所有设备
   */
  async startReport(deviceId) {
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`\u8BBE\u5907 ${deviceId} \u4E0D\u5B58\u5728`);
      }
      await device.startReport();
      logger3.info("DeviceManager", `[${deviceId}] \u5F00\u59CB\u4E0A\u62A5`);
    } else {
      const startPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.startReport();
          logger3.info("DeviceManager", `[${id}] \u5F00\u59CB\u4E0A\u62A5`);
        } catch (error) {
          logger3.error("DeviceManager", `[${id}] \u542F\u52A8\u4E0A\u62A5\u5931\u8D25:`, error);
        }
      });
      await Promise.allSettled(startPromises);
    }
  }
  /**
   * 停止上报 - 支持指定设备或所有设备
   */
  async stopReport(deviceId) {
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`\u8BBE\u5907 ${deviceId} \u4E0D\u5B58\u5728`);
      }
      await device.stopReport();
      logger3.info("DeviceManager", `[${deviceId}] \u505C\u6B62\u4E0A\u62A5`);
    } else {
      const stopPromises = Array.from(this.devices.entries()).map(async ([id, device]) => {
        try {
          await device.stopReport();
          logger3.info("DeviceManager", `[${id}] \u505C\u6B62\u4E0A\u62A5`);
        } catch (error) {
          logger3.error("DeviceManager", `[${id}] \u505C\u6B62\u4E0A\u62A5\u5931\u8D25:`, error);
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
        logger3.info("DeviceManager", `[${id}] \u65AD\u5F00\u8FDE\u63A5`);
      } catch (error) {
        logger3.error("DeviceManager", `[${id}] \u65AD\u5F00\u8FDE\u63A5\u5931\u8D25:`, error);
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
      logger3.info("DeviceManager", `\u5C1D\u8BD5\u91CD\u65B0\u8FDE\u63A5 ${failedConfigs.length} \u4E2A\u5931\u8D25\u7684\u8BBE\u5907`);
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
      logger3.error("DeviceManager", `[${deviceId}] \u91CD\u8FDE\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650 (${this.maxReconnectAttempts})\uFF0C\u505C\u6B62\u91CD\u8FDE`);
      this.reconnectAttempts.delete(deviceId);
      return;
    }
    const delay = this.reconnectDelay * 2 ** attempts;
    logger3.info("DeviceManager", `\u5C06\u5728 ${delay}ms \u540E\u5C1D\u8BD5\u91CD\u8FDE\u8BBE\u5907 ${deviceId} (\u7B2C ${attempts + 1} \u6B21)`);
    const timer = setTimeout(async () => {
      try {
        logger3.info("DeviceManager", `\u5F00\u59CB\u91CD\u8FDE\u8BBE\u5907 ${deviceId}`);
        await this.initializeDevice(config);
        this.reconnectAttempts.delete(deviceId);
        logger3.info("DeviceManager", `\u8BBE\u5907 ${deviceId} \u91CD\u8FDE\u6210\u529F`);
      } catch (error) {
        logger3.error("DeviceManager", `[${deviceId}] \u91CD\u8FDE\u5931\u8D25:`, error);
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
      logger3.info("DeviceManager", `\u53D6\u6D88\u8BBE\u5907 ${deviceId} \u7684\u91CD\u8FDE\u5B9A\u65F6\u5668`);
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

// src/communication.ts
import { z as z2 } from "zod";
var logger4 = getLogger();
var CommandCode = {
  START: 1,
  STOP: 2
};
var EventTypeCode = {
  STATUS: 1,
  ERROR: 2,
  DEVICE: 3,
  HEARTBEAT: 4
};
var RequestSchema = z2.object({
  c: z2.nativeEnum(CommandCode),
  d: z2.record(z2.unknown()).optional()
});
var RequestDataSchema = z2.object({
  rssi: z2.string().optional()
}).passthrough();
var ResponseSchema = z2.object({
  t: z2.nativeEnum(EventTypeCode),
  d: z2.record(z2.unknown())
});
function createStatusResponse(data) {
  const payload = {
    t: EventTypeCode.STATUS,
    d: data
  };
  return JSON.stringify(payload);
}
function createErrorResponse(message) {
  const payload = {
    t: EventTypeCode.ERROR,
    d: {
      msg: message
    }
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
function createHeartbeatEvent(data) {
  const payload = {
    t: EventTypeCode.HEARTBEAT,
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
    logger4.error("parseJSONMessage", "Invalid message format:", validation.error);
    return null;
  } catch (error) {
    logger4.error("parseJSONMessage", "Failed to parse JSON message:", error);
    return null;
  }
}
function parseRequestData(data) {
  try {
    const validation = RequestDataSchema.safeParse(data);
    if (validation.success) {
      return validation.data;
    }
    logger4.error("parseRequestData", "Invalid request data format:", validation.error);
    return null;
  } catch (error) {
    logger4.error("parseRequestData", "Failed to parse request data:", error);
    return null;
  }
}

// src/heartbeat-manager.ts
var logger5 = getLogger();
var HeartbeatManager = class {
  transport;
  deviceManager;
  heartbeatTimer = null;
  heartbeatInterval = 2e3;
  // 2秒
  constructor(transport, deviceManager) {
    this.transport = transport;
    this.deviceManager = deviceManager;
  }
  /**
   * 启动心跳定时器
   */
  start() {
    if (this.heartbeatTimer) {
      logger5.warn("HeartbeatManager", "\u5FC3\u8DF3\u5B9A\u65F6\u5668\u5DF2\u7ECF\u5728\u8FD0\u884C");
      return;
    }
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
    logger5.info("HeartbeatManager", `\u5FC3\u8DF3\u5B9A\u65F6\u5668\u5DF2\u542F\u52A8\uFF0C\u95F4\u9694: ${this.heartbeatInterval}ms`);
  }
  /**
   * 停止心跳定时器
   */
  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger5.info("HeartbeatManager", "\u5FC3\u8DF3\u5B9A\u65F6\u5668\u5DF2\u505C\u6B62");
    }
  }
  /**
   * 发送心跳事件
   */
  sendHeartbeat() {
    try {
      const stats = this.deviceManager.getConnectionStats();
      const heartbeatData = createHeartbeatEvent({
        run: stats.connected > 0
      });
      this.transport.send(heartbeatData);
      logger5.debug("HeartbeatManager", "\u5FC3\u8DF3\u4E8B\u4EF6\u5DF2\u53D1\u9001", { connected: stats.connected });
    } catch (error) {
      logger5.error("HeartbeatManager", "\u53D1\u9001\u5FC3\u8DF3\u4E8B\u4EF6\u5931\u8D25:", error);
    }
  }
  /**
   * 获取心跳状态
   */
  isRunning() {
    return this.heartbeatTimer !== null;
  }
  /**
   * 设置心跳间隔（仅在停止状态下有效）
   */
  setInterval(interval) {
    if (this.heartbeatTimer) {
      logger5.warn("HeartbeatManager", "\u5FC3\u8DF3\u5B9A\u65F6\u5668\u6B63\u5728\u8FD0\u884C\uFF0C\u65E0\u6CD5\u4FEE\u6539\u95F4\u9694");
      return;
    }
    if (interval < 1e3) {
      logger5.warn("HeartbeatManager", "\u5FC3\u8DF3\u95F4\u9694\u4E0D\u80FD\u5C0F\u4E8E1000ms\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C2000ms");
      return;
    }
    logger5.info("HeartbeatManager", `\u5FC3\u8DF3\u95F4\u9694\u8BBE\u7F6E\u4E3A: ${interval}ms`);
  }
};

// src/message-handler.ts
var logger6 = getLogger();
var MessageHandler = class {
  deviceManager;
  constructor(deviceManager) {
    this.deviceManager = deviceManager;
  }
  /**
   * 处理来自传输层的消息
   * @param message JSON 字符串消息
   * @param cb      响应回调
   */
  async handleMessage(message, cb) {
    const request = message;
    if (!request) {
      const errorResponse = createErrorResponse("Invalid message format");
      return cb(errorResponse);
    }
    try {
      switch (request.c) {
        case CommandCode.START:
          return cb(await this.handleStartCommand(request.d));
        case CommandCode.STOP:
          return cb(await this.handleStopCommand());
        default:
          return cb(createErrorResponse("Unknown command"));
      }
    } catch (error) {
      logger6.error("MessageHandler", "\u5904\u7406\u6307\u4EE4\u65F6\u53D1\u751F\u9519\u8BEF:", error);
      return cb(createErrorResponse(error.message || "Failed to execute command"));
    }
  }
  /**
   * 处理错误
   * @param error 错误信息
   * @param cb    响应回调
   */
  handleError(error, cb) {
    cb(createErrorResponse(error));
  }
  /**
   * 处理设备事件
   * @param device 设备数据
   * @returns 设备事件消息
   */
  handleDeviceEvent(device) {
    return createDeviceEvent(device);
  }
  /**
   * 处理启动扫描指令
   * @param requestData 请求数据
   * @returns 启动扫描响应
   */
  async handleStartCommand(requestData) {
    const data = parseRequestData(requestData);
    const rssi = data?.rssi || "-60";
    logger6.info("MessageHandler", "\u6536\u5230\u542F\u52A8\u626B\u63CF\u6307\u4EE4", { rssi });
    try {
      await this.deviceManager.startReport();
      logger6.info("MessageHandler", "\u6240\u6709\u8BBE\u5907\u5F00\u59CB\u4E0A\u62A5");
      return createStatusResponse({ msg: "Report started" });
    } catch (error) {
      logger6.error("MessageHandler", "\u542F\u52A8\u4E0A\u62A5\u5931\u8D25:", error);
      return createErrorResponse(error.message || "Failed to start report");
    }
  }
  /**
   * 处理停止扫描指令
   * @returns 停止扫描响应
   */
  async handleStopCommand() {
    try {
      await this.deviceManager.stopReport();
      logger6.info("MessageHandler", "\u6240\u6709\u8BBE\u5907\u505C\u6B62\u4E0A\u62A5");
      return createStatusResponse({ msg: "Report stopped" });
    } catch (error) {
      logger6.error("MessageHandler", "\u505C\u6B62\u4E0A\u62A5\u5931\u8D25:", error);
      return createErrorResponse(error.message || "Failed to stop report");
    }
  }
};

// src/serial-transport.ts
import { EventEmitter as EventEmitter3 } from "events";
import { ReadlineParser as ReadlineParser2 } from "@serialport/parser-readline";
import { SerialPort as SerialPort2 } from "serialport";
var logger7 = getLogger();
var SerialTransport = class extends EventEmitter3 {
  port = null;
  parser = null;
  config;
  isConnected = false;
  reconnectTimer = null;
  reconnectInterval = 5e3;
  // 重连间隔（毫秒）
  maxReconnectAttempts = 10;
  reconnectAttempts = 0;
  on(event, listener) {
    return super.on(event, listener);
  }
  constructor(config) {
    super();
    this.config = config;
  }
  /**
   * 启动串口传输层
   */
  start = async () => {
    logger7.info("SerialTransport", `\u542F\u52A8\u4E32\u53E3\u4F20\u8F93\u5C42: ${this.config.serialPath}`);
    await this.connect();
  };
  /**
   * 停止串口传输层
   */
  stop = async () => {
    logger7.info("SerialTransport", "\u505C\u6B62\u4E32\u53E3\u4F20\u8F93\u5C42");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.disconnect();
  };
  /**
   * 发送数据到上位机
   */
  send = (data) => {
    if (!this.isConnected || !this.port) {
      logger7.warn("SerialTransport", "\u4E32\u53E3\u672A\u8FDE\u63A5\uFF0C\u65E0\u6CD5\u53D1\u9001\u6570\u636E");
      return;
    }
    try {
      const dataWithNewline = data.endsWith("\r\n") ? data : `${data}\r
`;
      this.port.write(dataWithNewline, (err) => {
        if (err) {
          logger7.error("SerialTransport", "\u53D1\u9001\u6570\u636E\u5931\u8D25:", err);
          this.emit("error", `\u53D1\u9001\u6570\u636E\u5931\u8D25: ${err.message}`);
        } else {
          logger7.debug("SerialTransport", "\u53D1\u9001\u6570\u636E:", data);
        }
      });
    } catch (error) {
      logger7.error("SerialTransport", "\u53D1\u9001\u6570\u636E\u5F02\u5E38:", error);
      this.emit("error", `\u53D1\u9001\u6570\u636E\u5F02\u5E38: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  /**
   * 建立串口连接
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort2({
          path: this.config.serialPath,
          baudRate: this.config.baudRate || 115200,
          dataBits: this.config.dataBits,
          stopBits: this.config.stopBits,
          parity: this.config.parity || "none",
          autoOpen: false
        });
        this.parser = this.port.pipe(new ReadlineParser2({ delimiter: "\r\n" }));
        this.port.on("open", () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger7.info("SerialTransport", `\u4E32\u53E3\u8FDE\u63A5\u6210\u529F: ${this.config.serialPath}`);
          resolve();
        });
        this.port.on("error", (err) => {
          logger7.error("SerialTransport", "\u4E32\u53E3\u9519\u8BEF:", err);
          this.isConnected = false;
          this.emit("error", `\u4E32\u53E3\u9519\u8BEF: ${err.message}`);
          reject(err);
        });
        this.port.on("close", () => {
          logger7.warn("SerialTransport", "\u4E32\u53E3\u8FDE\u63A5\u5173\u95ED");
          this.isConnected = false;
          this.scheduleReconnect();
        });
        this.parser.on("data", (data) => {
          logger7.debug("SerialTransport", "\u63A5\u6536\u89E3\u6790\u5206\u9694\u7B26\u540E\u7684\u6570\u636E:", data);
          try {
            this.handleReceivedData(data);
          } catch (error) {
            logger7.error("SerialTransport", "\u5904\u7406\u63A5\u6536\u6570\u636E\u5931\u8D25:", error);
            this.emit("error", `\u5904\u7406\u63A5\u6536\u6570\u636E\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
        this.port.open();
      } catch (error) {
        logger7.error("SerialTransport", "\u521B\u5EFA\u4E32\u53E3\u8FDE\u63A5\u5931\u8D25:", error);
        reject(error);
      }
    });
  }
  /**
   * 断开串口连接
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (this.port && this.isConnected) {
        this.port.close(() => {
          this.isConnected = false;
          logger7.info("SerialTransport", "\u4E32\u53E3\u8FDE\u63A5\u5DF2\u65AD\u5F00");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  /**
   * 处理接收到的数据
   */
  handleReceivedData(data) {
    const responseCallback = (response) => {
      this.send(response);
    };
    try {
      const requestPayload = parseJSONMessage(data);
      if (!requestPayload) {
        logger7.warn("SerialTransport", "\u63A5\u6536\u5230\u7684\u6570\u636E\u683C\u5F0F\u4E0D\u6B63\u786E:", data);
        this.emit("error", `\u63A5\u6536\u5230\u7684\u6570\u636E\u683C\u5F0F\u4E0D\u6B63\u786E: ${data}`, responseCallback);
        return;
      }
      this.emit("data", requestPayload, responseCallback);
    } catch (error) {
      logger7.error("SerialTransport", "\u5904\u7406\u63A5\u6536\u6570\u636E\u5931\u8D25:", error);
      this.emit("error", `\u5904\u7406\u63A5\u6536\u6570\u636E\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`, responseCallback);
    }
  }
  /**
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger7.error("SerialTransport", `\u91CD\u8FDE\u5931\u8D25\uFF0C\u5DF2\u8FBE\u5230\u6700\u5927\u91CD\u8FDE\u6B21\u6570: ${this.maxReconnectAttempts}`);
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectAttempts++;
    logger7.info("SerialTransport", `${this.reconnectInterval / 1e3}\u79D2\u540E\u5C1D\u8BD5\u91CD\u8FDE (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        logger7.info("SerialTransport", "\u91CD\u8FDE\u6210\u529F");
      } catch (error) {
        logger7.error("SerialTransport", "\u91CD\u8FDE\u5931\u8D25:", error);
        this.scheduleReconnect();
      }
    }, this.reconnectInterval);
  }
  /**
   * 获取连接状态
   */
  isConnectedStatus() {
    return this.isConnected;
  }
  /**
   * 获取配置信息
   */
  getConfig() {
    return { ...this.config };
  }
};

// src/app-controller.ts
var logger8 = getLogger();
var AppController = class extends EventEmitter4 {
  deviceManager = null;
  transport = null;
  messageHandler = null;
  heartbeatManager = null;
  isInitialized = false;
  /**
   * 初始化应用程序
   */
  async initialize() {
    if (this.isInitialized) {
      logger8.warn("AppController", "\u5E94\u7528\u7A0B\u5E8F\u5DF2\u7ECF\u521D\u59CB\u5316");
      return;
    }
    try {
      const configManager2 = getConfigManager();
      this.initializeLogger(configManager2);
      this.validateConfiguration(configManager2);
      await this.initializeDeviceManager(configManager2);
      await this.initializeTransport(configManager2);
      this.initializeMessageHandler();
      this.initializeHeartbeatManager();
      this.setupEventListeners();
      await this.startTransport();
      await this.initializeDevices();
      this.startHeartbeat();
      this.isInitialized = true;
      logger8.info("AppController", "\u5E94\u7528\u7A0B\u5E8F\u521D\u59CB\u5316\u5B8C\u6210");
    } catch (error) {
      logger8.error("AppController", "\u5E94\u7528\u7A0B\u5E8F\u521D\u59CB\u5316\u5931\u8D25:", error);
      throw error;
    }
  }
  /**
   * 关闭应用程序
   */
  async shutdown() {
    logger8.info("AppController", "\u6B63\u5728\u5173\u95ED\u5E94\u7528\u7A0B\u5E8F...");
    try {
      this.heartbeatManager?.stop();
      await this.deviceManager?.disconnectAll();
      await this.transport?.stop();
      this.isInitialized = false;
      logger8.info("AppController", "\u5E94\u7528\u7A0B\u5E8F\u5DF2\u5B89\u5168\u5173\u95ED");
    } catch (error) {
      logger8.error("AppController", "\u5173\u95ED\u5E94\u7528\u7A0B\u5E8F\u65F6\u53D1\u751F\u9519\u8BEF:", error);
      throw error;
    }
  }
  /**
   * 获取设备管理器
   */
  getDeviceManager() {
    return this.deviceManager;
  }
  /**
   * 获取传输层
   */
  getTransport() {
    return this.transport;
  }
  /**
   * 初始化日志管理器
   */
  initializeLogger(configManager2) {
    const loggingConfig = configManager2.getLoggingConfig();
    getLogger({
      level: parseLogLevel(loggingConfig.level),
      enableDevicePrefix: loggingConfig.enableDevicePrefix,
      enableTimestamp: true
    });
    logger8.info("AppController", "\u65E5\u5FD7\u7BA1\u7406\u5668\u521D\u59CB\u5316\u5B8C\u6210");
  }
  /**
   * 验证配置
   */
  validateConfiguration(configManager2) {
    const validation = configManager2.validate();
    if (!validation.valid) {
      logger8.error("AppController", "\u914D\u7F6E\u9A8C\u8BC1\u5931\u8D25:");
      validation.errors.forEach((error) => logger8.error("AppController", `  - ${error}`));
      throw new Error("\u914D\u7F6E\u9A8C\u8BC1\u5931\u8D25");
    }
    logger8.info("AppController", "\u914D\u7F6E\u9A8C\u8BC1\u901A\u8FC7");
  }
  /**
   * 初始化设备管理器
   */
  async initializeDeviceManager(configManager2) {
    const deviceConfigs = configManager2.getDeviceConfigs();
    if (deviceConfigs.length === 0) {
      throw new Error("\u6CA1\u6709\u542F\u7528\u7684\u8BBE\u5907\u914D\u7F6E");
    }
    logger8.info("AppController", `\u52A0\u8F7D\u4E86 ${deviceConfigs.length} \u4E2A\u8BBE\u5907\u914D\u7F6E:`);
    deviceConfigs.forEach((device) => {
      logger8.info("AppController", `  - ${device.deviceId}: ${device.serialPath}`);
    });
    this.deviceManager = new DeviceManager(deviceConfigs);
    logger8.info("AppController", "\u8BBE\u5907\u7BA1\u7406\u5668\u521D\u59CB\u5316\u5B8C\u6210");
  }
  /**
   * 初始化传输层
   */
  async initializeTransport(configManager2) {
    const transportConfig = configManager2.getTransportConfig();
    this.transport = new SerialTransport(transportConfig);
    logger8.info("AppController", "\u4F20\u8F93\u5C42\u521D\u59CB\u5316\u5B8C\u6210");
  }
  /**
   * 初始化消息处理器
   */
  initializeMessageHandler() {
    if (!this.deviceManager) {
      throw new Error("\u8BBE\u5907\u7BA1\u7406\u5668\u672A\u521D\u59CB\u5316");
    }
    this.messageHandler = new MessageHandler(this.deviceManager);
    logger8.info("AppController", "\u6D88\u606F\u5904\u7406\u5668\u521D\u59CB\u5316\u5B8C\u6210");
  }
  /**
   * 初始化心跳管理器
   */
  initializeHeartbeatManager() {
    if (!this.transport || !this.deviceManager) {
      throw new Error("\u4F20\u8F93\u5C42\u6216\u8BBE\u5907\u7BA1\u7406\u5668\u672A\u521D\u59CB\u5316");
    }
    this.heartbeatManager = new HeartbeatManager(this.transport, this.deviceManager);
    logger8.info("AppController", "\u5FC3\u8DF3\u7BA1\u7406\u5668\u521D\u59CB\u5316\u5B8C\u6210");
  }
  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (!this.transport || !this.deviceManager || !this.messageHandler) {
      throw new Error("\u7EC4\u4EF6\u672A\u5B8C\u5168\u521D\u59CB\u5316");
    }
    this.transport.on("data", (message, cb) => {
      this.messageHandler.handleMessage(message, cb);
    });
    this.transport.on("error", (error, cb) => {
      logger8.error("AppController", "\u4F20\u8F93\u5C42\u9519\u8BEF:", error);
      this.messageHandler.handleError(error, cb);
    });
    this.deviceManager.on("device", (device) => {
      logger8.info("AppController", "\u8BBE\u5907\u4E0A\u62A5:", device);
      const event = this.messageHandler.handleDeviceEvent(device);
      this.transport.send(event);
    });
    this.deviceManager.on("deviceConnected", (info) => {
      logger8.info("AppController", `\u8BBE\u5907 ${info.deviceId} (${info.serialPath}) \u8FDE\u63A5\u6210\u529F`);
    });
    this.deviceManager.on("deviceDisconnected", (info) => {
      logger8.warn("AppController", `\u8BBE\u5907 ${info.deviceId} (${info.serialPath}) \u65AD\u5F00\u8FDE\u63A5`);
    });
    this.deviceManager.on("deviceError", (error) => {
      logger8.error("AppController", `\u8BBE\u5907 ${error.deviceId} (${error.serialPath}) \u53D1\u751F\u9519\u8BEF:`, error.error);
    });
    logger8.info("AppController", "\u4E8B\u4EF6\u76D1\u542C\u5668\u8BBE\u7F6E\u5B8C\u6210");
  }
  /**
   * 启动传输层
   */
  async startTransport() {
    if (!this.transport) {
      throw new Error("\u4F20\u8F93\u5C42\u672A\u521D\u59CB\u5316");
    }
    await this.transport.start();
    logger8.info("AppController", "\u4F20\u8F93\u5C42\u542F\u52A8\u6210\u529F");
  }
  /**
   * 初始化设备
   */
  async initializeDevices() {
    if (!this.deviceManager) {
      throw new Error("\u8BBE\u5907\u7BA1\u7406\u5668\u672A\u521D\u59CB\u5316");
    }
    await this.deviceManager.initializeDevices();
    const stats = this.deviceManager.getConnectionStats();
    logger8.info("AppController", `\u8BBE\u5907\u521D\u59CB\u5316\u5B8C\u6210: ${stats.connected}/${stats.total} \u4E2A\u8BBE\u5907\u8FDE\u63A5\u6210\u529F`);
    if (stats.reconnecting > 0) {
      logger8.info("AppController", `${stats.reconnecting} \u4E2A\u8BBE\u5907\u6B63\u5728\u91CD\u8FDE\u4E2D`);
    }
    if (stats.connected === 0 && stats.reconnecting === 0) {
      throw new Error("\u6CA1\u6709\u8BBE\u5907\u8FDE\u63A5\u6210\u529F");
    }
  }
  /**
   * 启动心跳
   */
  startHeartbeat() {
    if (!this.heartbeatManager) {
      throw new Error("\u5FC3\u8DF3\u7BA1\u7406\u5668\u672A\u521D\u59CB\u5316");
    }
    this.heartbeatManager.start();
    logger8.info("AppController", "\u5FC3\u8DF3\u5B9A\u65F6\u5668\u5DF2\u542F\u52A8");
  }
};

// src/index.ts
var logger9 = getLogger();
var appController = null;
async function main() {
  try {
    logger9.info("Main", "\u6B63\u5728\u542F\u52A8\u84DD\u7259\u8BBE\u5907\u68C0\u6D4B\u7CFB\u7EDF...");
    appController = new AppController();
    await appController.initialize();
    logger9.info("Main", "\u84DD\u7259\u8BBE\u5907\u68C0\u6D4B\u7CFB\u7EDF\u542F\u52A8\u6210\u529F");
  } catch (error) {
    logger9.error("Main", "\u542F\u52A8\u5931\u8D25:", error);
    process2.exit(1);
  }
}
process2.on("SIGINT", async () => {
  logger9.info("Main", "\n\u6B63\u5728\u5173\u95ED\u7A0B\u5E8F...");
  try {
    if (appController) {
      await appController.shutdown();
    }
    logger9.info("Main", "\u7A0B\u5E8F\u5DF2\u5B89\u5168\u5173\u95ED");
  } catch (error) {
    logger9.error("Main", "\u5173\u95ED\u7A0B\u5E8F\u65F6\u53D1\u751F\u9519\u8BEF:", error);
  }
  process2.exit();
});
main();
//# sourceMappingURL=index.js.map