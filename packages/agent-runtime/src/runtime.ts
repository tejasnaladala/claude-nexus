import type {
  NexusMessage,
  AgentConfig,
  AgentRecord,
  AgentRegisterPayload,
  AgentRegisteredPayload,
} from "@claude-nexus/core";
import {
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_BACKOFF_MULTIPLIER,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_JITTER,
  generateMessageId,
  detectPlatform,
} from "@claude-nexus/core";
import { Connection } from "./connection.js";
import { Heartbeat } from "./heartbeat.js";
import { ExecutionProxy } from "./execution-proxy.js";
import { EventEmitter } from "node:events";

export type RuntimeState = "stopped" | "starting" | "connected" | "disconnected";

const REGISTRATION_TIMEOUT_MS = 10_000;

export class AgentRuntime extends EventEmitter {
  private connection: Connection | null = null;
  private readonly heartbeat: Heartbeat;
  private readonly executionProxy: ExecutionProxy;
  private readonly config: AgentConfig;
  private agentId: string | null = null;
  private state: RuntimeState = "stopped";
  private activeTasks: readonly string[] = [];
  private currentStatus: "idle" | "working" | "debating" = "idle";

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.executionProxy = new ExecutionProxy(config.executionAllowlist);
    this.heartbeat = new Heartbeat(() => ({
      status: this.currentStatus,
      activeTasks: [...this.activeTasks],
    }));
  }

  async start(nexusUrl?: string): Promise<AgentRecord> {
    const url = nexusUrl || this.config.nexusUrl;
    if (!url) {
      throw new Error("No nexus URL provided");
    }

    this.state = "starting";
    this.emit("stateChange", this.state);

    this.connection = new Connection({
      url,
      reconnectInitialDelayMs: RECONNECT_INITIAL_DELAY_MS,
      reconnectMaxDelayMs: RECONNECT_MAX_DELAY_MS,
      reconnectBackoffMultiplier: RECONNECT_BACKOFF_MULTIPLIER,
      reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS,
      reconnectJitter: RECONNECT_JITTER,
    });

    this.connection.onMessage((data) => this.handleMessage(data));
    this.connection.onStateChange((connState) => {
      if (connState === "disconnected") {
        this.state = "disconnected";
        this.emit("stateChange", this.state);
      }
    });
    this.connection.onError((error) => this.emit("error", error));

    await this.connection.connect();

    // Register with the nexus server
    const registration = await this.register();
    this.state = "connected";
    this.emit("stateChange", this.state);
    return registration;
  }

  async stop(): Promise<void> {
    this.heartbeat.stop();

    if (this.connection && this.agentId) {
      this.sendMessage("agent.deregister", "nexus", {
        agentId: this.agentId,
      });
    }

    this.connection?.disconnect();
    this.connection = null;
    this.agentId = null;
    this.state = "stopped";
    this.emit("stateChange", this.state);
  }

  sendMessage(
    type: NexusMessage["type"],
    to: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): boolean {
    if (!this.connection || !this.agentId) {
      return false;
    }

    const message: NexusMessage = {
      id: generateMessageId(),
      type,
      from: this.agentId,
      to,
      timestamp: Date.now(),
      correlationId,
      payload,
    };

    return this.connection.send(JSON.stringify(message));
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  getState(): RuntimeState {
    return this.state;
  }

  getActiveTasks(): readonly string[] {
    return [...this.activeTasks];
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  addActiveTask(taskId: string): void {
    this.activeTasks = [...this.activeTasks, taskId];
    this.currentStatus = "working";
  }

  removeActiveTask(taskId: string): void {
    this.activeTasks = this.activeTasks.filter((t) => t !== taskId);
    if (this.activeTasks.length === 0) {
      this.currentStatus = "idle";
    }
  }

  setStatus(status: "idle" | "working" | "debating"): void {
    this.currentStatus = status;
  }

  getExecutionProxy(): ExecutionProxy {
    return this.executionProxy;
  }

  private async register(): Promise<AgentRecord> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Registration timeout"));
      }, REGISTRATION_TIMEOUT_MS);

      const registrationHandler = (data: string): void => {
        try {
          const message: NexusMessage = JSON.parse(data);
          if (message.type === "agent.registered") {
            clearTimeout(timeout);
            const payload =
              message.payload as unknown as AgentRegisteredPayload;
            this.agentId = payload.agentId;

            // Start heartbeat after successful registration
            this.heartbeat.start(this.agentId, (heartbeatData) => {
              this.sendMessage(
                "agent.heartbeat",
                "nexus",
                heartbeatData as unknown as Record<string, unknown>,
              );
            });

            resolve({ agentId: payload.agentId } as AgentRecord);
          }
        } catch {
          // Ignore parse errors during registration — non-registration
          // messages will be handled by the main handler
        }
      };

      // Temporarily wire up the registration listener alongside the
      // main message handler
      this.connection!.onMessage((data) => {
        registrationHandler(data);
        this.handleMessage(data);
      });

      const payload: AgentRegisterPayload = {
        name: this.config.name,
        developerId: `dev-${this.config.name}`,
        skills: this.config.skills,
        platform: detectPlatform(),
        maxConcurrentTasks: this.config.maxConcurrentTasks,
      };

      this.sendMessageRaw(
        "agent.register",
        "nexus",
        payload as unknown as Record<string, unknown>,
      );
    });
  }

  private sendMessageRaw(
    type: NexusMessage["type"],
    to: string,
    payload: Record<string, unknown>,
  ): boolean {
    if (!this.connection) {
      return false;
    }

    const message: NexusMessage = {
      id: generateMessageId(),
      type,
      from: this.agentId || "unregistered",
      to,
      timestamp: Date.now(),
      payload,
    };

    return this.connection.send(JSON.stringify(message));
  }

  private handleMessage(data: string): void {
    try {
      const message: NexusMessage = JSON.parse(data);
      this.emit("message", message);

      // Handle execution requests locally
      if (message.type === "exec.request") {
        this.handleExecRequest(message);
      }
    } catch (error) {
      this.emit("error", new Error(`Failed to parse message: ${error}`));
    }
  }

  private async handleExecRequest(message: NexusMessage): Promise<void> {
    const payload = message.payload as Record<string, unknown>;

    const result = await this.executionProxy.execute(
      payload.command as string,
      {
        requestId: message.id,
        agentId: this.agentId ?? "",
        workingDirectory: payload.workingDirectory as string | undefined,
        env: payload.env as Record<string, string> | undefined,
        timeoutMs: payload.timeoutMs as number | undefined,
      },
    );

    this.sendMessage(
      "exec.result",
      "nexus",
      {
        ...result,
        requestingAgentId: payload.requestingAgentId,
      },
      message.id,
    );
  }
}
