#!/usr/bin/env ts-node

// test.ts
import process from "process";
import axios from "axios";
import { EventSource } from "eventsource";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
var BASE_URL = "http://192.168.110.234:8888";
var CommandCode = {
  START: 1,
  HEARTBEAT: 2,
  STOP: 3
};
async function sendCommand(command, data = {}) {
  try {
    const response = await axios.post(`${BASE_URL}/command`, {
      c: command,
      d: data
    });
    console.log("\u2705  Response:");
    console.log(response.data);
  } catch (error) {
    console.error("\u274C  \u8BF7\u6C42\u5931\u8D25:");
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      if (axiosError.response) {
        console.error(`  - \u72B6\u6001\u7801: ${axiosError.response.status}`);
        console.error("  - \u54CD\u5E94\u6570\u636E:", axiosError.response.data);
      } else if (axiosError.request) {
        console.error("  - \u9519\u8BEF: \u672A\u6536\u5230\u670D\u52A1\u5668\u54CD\u5E94\u3002");
        console.error("  - \u63D0\u793A: \u8BF7\u786E\u8BA4\u4E3B\u7A0B\u5E8F (src/index.ts) \u662F\u5426\u5DF2\u5728\u8FD0\u884C\uFF0C\u5E76\u4E14\u76D1\u542C\u7684\u5730\u5740\u548C\u7AEF\u53E3\u6B63\u786E\u3002");
      } else {
        console.error("  - \u9519\u8BEF: \u8BF7\u6C42\u8BBE\u7F6E\u5931\u8D25\u3002");
        console.error("  - \u8BE6\u60C5:", axiosError.message);
      }
    } else {
      console.error("  - \u53D1\u751F\u672A\u77E5\u9519\u8BEF:", error.message || error);
    }
  }
}
yargs(hideBin(process.argv)).scriptName("test-client").command(
  "heartbeat",
  "Send heartbeat command",
  () => {
  },
  async () => {
    console.log("Sending [heartbeat] command...");
    await sendCommand(CommandCode.HEARTBEAT);
  }
).command(
  "start",
  "Send start scan command",
  () => {
  },
  async () => {
    console.log("Sending [start] command...");
    await sendCommand(CommandCode.START);
  }
).command(
  "stop",
  "Send stop scan command",
  () => {
  },
  async () => {
    console.log("Sending [stop] command...");
    await sendCommand(CommandCode.STOP);
  }
).command(
  "listen",
  "Listen for device events from the server",
  () => {
  },
  () => {
    console.log("Listening for events from server...");
    const es = new EventSource(`${BASE_URL}/events`);
    es.onmessage = (event) => {
      console.log("\u{1F4E9}  Received event:");
      console.log(JSON.parse(event.data));
    };
    es.onerror = (err) => {
      if (err.type === "error" && err.status === 404) {
        console.error("\u274C \u627E\u4E0D\u5230\u670D\u52A1\u5668\u3002\u4E3B\u5E94\u7528\u7A0B\u5E8F (src/index.ts) \u662F\u5426\u6B63\u5728\u8FD0\u884C\uFF1F");
      } else {
        console.error("\u274C EventSource \u9519\u8BEF:", err);
      }
      es.close();
    };
  }
).demandCommand(1, "You need at least one command before moving on").help().parse();
//# sourceMappingURL=test.js.map