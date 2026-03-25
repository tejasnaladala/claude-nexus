import { HEARTBEAT_INTERVAL_MS } from "@claude-nexus/core";
import { cpus, freemem, totalmem } from "node:os";

export interface HeartbeatData {
  readonly agentId: string;
  readonly status: "idle" | "working" | "debating";
  readonly activeTasks: readonly string[];
  readonly cpuLoad: number;
  readonly memoryUsage: number;
  readonly uptime: number;
}

export class Heartbeat {
  private interval: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();
  private sendFn: ((data: HeartbeatData) => void) | null = null;
  private agentId = "";
  private readonly getStatus: () => {
    status: "idle" | "working" | "debating";
    activeTasks: string[];
  };

  constructor(
    getStatus: () => {
      status: "idle" | "working" | "debating";
      activeTasks: string[];
    },
  ) {
    this.getStatus = getStatus;
  }

  start(agentId: string, sendFn: (data: HeartbeatData) => void): void {
    this.agentId = agentId;
    this.sendFn = sendFn;
    this.startTime = Date.now();

    this.interval = setInterval(() => {
      this.send();
    }, HEARTBEAT_INTERVAL_MS);

    // Send immediately on start
    this.send();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private send(): void {
    if (!this.sendFn) {
      return;
    }

    const { status, activeTasks } = this.getStatus();

    this.sendFn({
      agentId: this.agentId,
      status,
      activeTasks,
      cpuLoad: this.getCpuLoad(),
      memoryUsage: 1 - freemem() / totalmem(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    });
  }

  private getCpuLoad(): number {
    const cpuInfo = cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpuInfo) {
      for (const type of Object.keys(cpu.times) as Array<
        keyof typeof cpu.times
      >) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    return totalTick === 0 ? 0 : 1 - totalIdle / totalTick;
  }
}
