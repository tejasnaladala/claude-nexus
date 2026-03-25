import { WebSocketServer, WebSocket } from "ws";
import type {
  NexusMessage,
  AgentRegisterPayload,
  AgentRegisteredPayload,
  HeartbeatPayload,
  TaskSubmitPayload,
  TaskResultPayload,
  DebateArgumentPayload,
  ExecRequestPayload,
  PeerMessagePayload,
  NexusErrorPayload,
} from "@claude-nexus/core";
import {
  NEXUS_VERSION,
  DEFAULT_PORT,
  HEARTBEAT_INTERVAL_MS,
} from "@claude-nexus/core";
import { generateMessageId } from "@claude-nexus/core";
import { AgentRegistry } from "./agent-registry.js";
import { TaskEngine } from "./task-engine.js";
import { DebateEngine } from "./debate-engine.js";
import { MemoryStore } from "./memory-store.js";
import { MessageRouter } from "./message-router.js";

export interface NexusServerConfig {
  port: number;
  host: string;
  dbPath?: string;
}

export class NexusServer {
  private wss: WebSocketServer | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private taskAssignInterval: ReturnType<typeof setInterval> | null = null;

  readonly agentRegistry: AgentRegistry;
  readonly taskEngine: TaskEngine;
  readonly debateEngine: DebateEngine;
  readonly memoryStore: MemoryStore;
  readonly messageRouter: MessageRouter;

  private readonly config: NexusServerConfig;

  constructor(config: Partial<NexusServerConfig> = {}) {
    this.config = {
      port: config.port ?? DEFAULT_PORT,
      host: config.host ?? "0.0.0.0",
      dbPath: config.dbPath,
    };

    this.memoryStore = new MemoryStore(this.config.dbPath);
    this.agentRegistry = new AgentRegistry();
    this.taskEngine = new TaskEngine(this.agentRegistry, this.memoryStore);
    this.debateEngine = new DebateEngine(this.memoryStore);
    this.messageRouter = new MessageRouter();

    this.registerHandlers();
  }

  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        port: this.config.port,
        host: this.config.host,
      });

      this.wss.on("listening", () => {
        const url = `ws://${this.config.host}:${this.config.port}`;
        console.log(`[Nexus] Server listening on ${url}`);

        // Start periodic health checks
        this.healthCheckInterval = setInterval(() => {
          this.runHealthCheck();
        }, HEARTBEAT_INTERVAL_MS * 2);

        // Start periodic task auto-assignment
        this.taskAssignInterval = setInterval(() => {
          this.taskEngine.autoAssignQueued();
        }, 5000);

        const addr = this.wss!.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : this.config.port;
        const actualUrl = `ws://${this.config.host}:${actualPort}`;
        resolve({ port: actualPort, url: actualUrl });
      });

      this.wss.on("error", (error) => {
        console.error("[Nexus] Server error:", error);
        reject(error);
      });

      this.wss.on("connection", (ws, req) => {
        const remoteAddr = req.socket.remoteAddress || "unknown";
        console.log(`[Nexus] New connection from ${remoteAddr}`);
        this.handleConnection(ws);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.taskAssignInterval) {
      clearInterval(this.taskAssignInterval);
      this.taskAssignInterval = null;
    }

    // Notify all agents
    const disconnectMsg = this.createNexusMessage("nexus.migration", "broadcast", {
      reason: "nexus_shutdown",
    });
    this.messageRouter.broadcast(disconnectMsg);

    // Close all connections
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close(1000, "Nexus shutting down");
      }
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    this.memoryStore.close();
    console.log("[Nexus] Server stopped");
  }

  private handleConnection(ws: WebSocket): void {
    let agentId: string | null = null;

    ws.on("message", async (data) => {
      try {
        const raw = data.toString();
        const message: NexusMessage = JSON.parse(raw);

        // Track which agent this socket belongs to
        if (message.type === "agent.register") {
          // Registration is handled by the handler
        } else if (!agentId && message.from) {
          agentId = message.from;
        }

        await this.messageRouter.route(message, ws);
      } catch (error) {
        console.error("[Nexus] Failed to process message:", error);
        const errMsg = this.createNexusMessage("nexus.error", agentId || "unknown", {
          code: "INVALID_MESSAGE",
          message: error instanceof Error ? error.message : "Unknown error",
        } satisfies NexusErrorPayload);
        ws.send(JSON.stringify(errMsg));
      }
    });

    ws.on("close", (code, _reason) => {
      if (agentId) {
        console.log(`[Nexus] Agent ${agentId} disconnected (${code})`);
        this.handleDisconnect(agentId);
      }
    });

    ws.on("error", (error) => {
      console.error(`[Nexus] WebSocket error for ${agentId}:`, error);
    });
  }

  private registerHandlers(): void {
    // Agent registration
    this.messageRouter.onMessage("agent.register", (message, ws) => {
      const payload = message.payload as unknown as AgentRegisterPayload;
      const record = this.agentRegistry.register(payload);
      const agentId = record.agentId;

      this.messageRouter.registerSocket(agentId, ws);

      const response = this.createNexusMessage(
        "agent.registered",
        agentId,
        {
          agentId,
          nexusVersion: NEXUS_VERSION,
          connectedAgents: this.agentRegistry.getSummaries(),
          memorySnapshot: this.memoryStore.getSnapshot() as unknown as Record<string, unknown>,
        } satisfies AgentRegisteredPayload,
        message.id,
      );

      ws.send(JSON.stringify(response));

      // Notify other agents
      const notification = this.createNexusMessage("peer.message", "broadcast", {
        content: `Agent "${record.name}" has joined the nexus.`,
        messageType: "chat",
      } satisfies PeerMessagePayload);
      this.messageRouter.broadcast(notification, agentId);

      console.log(
        `[Nexus] Agent registered: ${record.name} (${agentId}) with skills: ${record.skills.join(", ")}`,
      );
    });

    // Heartbeat
    this.messageRouter.onMessage("agent.heartbeat", (message) => {
      const payload = message.payload as unknown as HeartbeatPayload;
      this.agentRegistry.updateHeartbeat(payload.agentId, {
        status: payload.status,
        activeTasks: [...payload.activeTasks],
        cpuLoad: payload.cpuLoad,
        memoryUsage: payload.memoryUsage,
      });

      const ack = this.createNexusMessage(
        "agent.heartbeat_ack",
        payload.agentId,
        { timestamp: Date.now() },
        message.id,
      );
      this.messageRouter.sendTo(payload.agentId, ack);
    });

    // Agent deregister
    this.messageRouter.onMessage("agent.deregister", (message) => {
      this.handleDisconnect(message.from);
    });

    // Task submit
    this.messageRouter.onMessage("task.submit", (message) => {
      const payload = message.payload as unknown as TaskSubmitPayload;

      if (this.taskEngine.isDuplicate(payload as any)) {
        const errMsg = this.createNexusMessage("nexus.error", message.from, {
          code: "DUPLICATE_TASK",
          message: "A similar task is already in the queue.",
        } satisfies NexusErrorPayload, message.id);
        this.messageRouter.sendTo(message.from, errMsg);
        return;
      }

      const task = this.taskEngine.submit(
        {
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          skillsRequired: payload.skillsRequired,
          constraints: payload.constraints,
          parentTaskId: payload.parentTaskId,
          autoReview: payload.autoReview,
          artifacts: payload.artifacts as any,
        },
        message.from,
      );

      const response = this.createNexusMessage(
        "task.submitted",
        message.from,
        { taskId: task.taskId, task },
        message.id,
      );
      this.messageRouter.sendTo(message.from, response);

      // Try auto-assignment
      const bestAgent = this.agentRegistry.findBestForSkills([...task.skillsRequired]);
      if (bestAgent) {
        const assigned = this.taskEngine.assign(
          task.taskId,
          bestAgent.agentId,
          `Auto-assigned: skill match for ${task.skillsRequired.join(", ")}`,
        );
        if (assigned) {
          const assignMsg = this.createNexusMessage(
            "task.assigned",
            bestAgent.agentId,
            {
              taskId: assigned.taskId,
              task: assigned,
              assignedBy: "nexus_auto",
              reason: `Skill match for: ${task.skillsRequired.join(", ")}`,
            },
          );
          this.messageRouter.sendTo(bestAgent.agentId, assignMsg);
        }
      }
    });

    // Task claim
    this.messageRouter.onMessage("task.claimed", (message) => {
      const payload = message.payload as { taskId: string };
      const task = this.taskEngine.claim(payload.taskId, message.from);
      if (task) {
        const response = this.createNexusMessage(
          "task.assigned",
          message.from,
          { taskId: task.taskId, task, assignedBy: message.from, reason: "Self-claimed" },
          message.id,
        );
        this.messageRouter.sendTo(message.from, response);
      }
    });

    // Task result
    this.messageRouter.onMessage("task.result", (message) => {
      const payload = message.payload as unknown as TaskResultPayload;
      const task = this.taskEngine.submitResult(payload.taskId, {
        taskId: payload.taskId,
        result: payload.result,
        artifacts: payload.artifacts as any,
        confidence: payload.confidence,
        executionTimeMs: payload.executionTimeMs,
        notes: payload.notes,
        submittedBy: message.from,
        submittedAt: Date.now(),
      });

      if (task) {
        if (task.status === "review") {
          // Trigger debate for review
          const reviewers = this.agentRegistry
            .getByStatus("ready")
            .filter((a) => a.agentId !== message.from)
            .slice(0, 1);

          if (reviewers.length > 0) {
            const debate = this.debateEngine.initiate({
              topic: `Review result for task: ${task.title}`,
              context: payload.result,
              taskId: task.taskId,
              participants: [message.from, ...reviewers.map((r) => r.agentId)],
              maxRounds: 2,
              timeoutPerRoundMs: 60000,
              consensusThreshold: 0.7,
              triggerType: "auto_review",
            });

            this.taskEngine.setStatus(task.taskId, "debating");

            for (const participant of debate.config.participants) {
              const debateMsg = this.createNexusMessage(
                "debate.initiated",
                participant,
                { debateId: debate.debateId, config: debate.config },
              );
              this.messageRouter.sendTo(participant, debateMsg);
            }
          } else {
            // No reviewers available — auto-approve
            this.taskEngine.approve(task.taskId);
            const completeMsg = this.createNexusMessage(
              "task.completed",
              message.from,
              { taskId: task.taskId, task, result: payload },
            );
            this.messageRouter.sendTo(message.from, completeMsg);
          }
        } else if (task.status === "approved") {
          this.taskEngine.complete(task.taskId);
          const completeMsg = this.createNexusMessage(
            "task.completed",
            message.from,
            { taskId: task.taskId, task, result: payload },
          );
          this.messageRouter.sendTo(message.from, completeMsg);
        }
      }
    });

    // Debate argument
    this.messageRouter.onMessage("debate.argument", (message) => {
      const payload = message.payload as unknown as DebateArgumentPayload;
      const argument = this.debateEngine.submitArgument(
        payload.debateId,
        message.from,
        payload.position,
        payload.reasoning,
        [...payload.evidence],
        payload.confidence,
      );

      if (argument) {
        // Broadcast to other participants
        const session = this.debateEngine.get(payload.debateId);
        if (session) {
          for (const participant of session.config.participants) {
            if (participant === message.from) continue;
            const argMsg = this.createNexusMessage(
              "debate.argument",
              participant,
              { ...payload, agentId: message.from },
            );
            this.messageRouter.sendTo(participant, argMsg);
          }

          // Check if debate is resolved
          if (session.status === "resolved" && session.verdict) {
            for (const participant of session.config.participants) {
              const verdictMsg = this.createNexusMessage(
                "debate.verdict",
                participant,
                session.verdict,
              );
              this.messageRouter.sendTo(participant, verdictMsg);
            }

            // Auto-approve the task if debate resolves
            if (session.config.taskId) {
              this.taskEngine.approve(session.config.taskId);
            }
          }
        }
      }
    });

    // Memory write
    this.messageRouter.onMessage("memory.write", (message) => {
      const payload = message.payload as { key: string; value: unknown; scope: any; ttl?: number };
      const entry = this.memoryStore.write(
        payload.key,
        payload.value,
        payload.scope || "shared",
        message.from,
        payload.ttl,
      );

      // Broadcast memory update
      const syncMsg = this.createNexusMessage("memory.sync", "broadcast", {
        entries: [entry],
        timestamp: Date.now(),
        version: this.memoryStore.version,
      });
      this.messageRouter.broadcast(syncMsg, message.from);
    });

    // Memory read
    this.messageRouter.onMessage("memory.read", (message) => {
      const payload = message.payload as { key: string; scope: any };
      const entry = this.memoryStore.read(payload.key, payload.scope || "shared");

      const response = this.createNexusMessage(
        "memory.read_result",
        message.from,
        { entry },
        message.id,
      );
      this.messageRouter.sendTo(message.from, response);
    });

    // Remote execution request — forward to target agent
    this.messageRouter.onMessage("exec.request", (message) => {
      const payload = message.payload as unknown as ExecRequestPayload;
      const forwardMsg = this.createNexusMessage(
        "exec.request",
        payload.targetAgentId,
        { ...payload, requestingAgentId: message.from },
        message.id,
      );
      this.messageRouter.sendTo(payload.targetAgentId, forwardMsg);
    });

    // Remote execution result — forward back to requester
    this.messageRouter.onMessage("exec.result", (message) => {
      const payload = message.payload as any;
      if (payload.requestingAgentId) {
        const resultMsg = this.createNexusMessage(
          "exec.result",
          payload.requestingAgentId,
          payload,
          message.correlationId,
        );
        this.messageRouter.sendTo(payload.requestingAgentId, resultMsg);
      }
    });

    // Peer message — forward to target or broadcast
    this.messageRouter.onMessage("peer.message", (message) => {
      // Handle special query messages from MCP tools
      const payload = message.payload as any;
      if (payload.content === "__nexus_query_status") {
        const status = this.getStatus();
        const agents = this.agentRegistry.getSummaries();
        const response = this.createNexusMessage("peer.message", message.from, {
          content: JSON.stringify({ type: "status_response", status, agents }),
          messageType: "context_share",
        }, message.id);
        this.messageRouter.sendTo(message.from, response);
        return;
      }
      if (payload.content === "__nexus_query_tasks") {
        const filter = payload.filter || "all";
        let tasks;
        if (filter === "available") {
          tasks = this.taskEngine.getAvailable();
        } else if (filter === "mine") {
          tasks = this.taskEngine.getByAgent(message.from);
        } else {
          tasks = this.taskEngine.getAll();
        }
        const taskSummaries = tasks.map(t => ({
          taskId: t.taskId,
          title: t.title,
          status: t.status,
          priority: t.priority,
          assignedAgentId: t.assignedAgentId,
          skillsRequired: t.skillsRequired,
        }));
        const response = this.createNexusMessage("peer.message", message.from, {
          content: JSON.stringify({ type: "tasks_response", tasks: taskSummaries }),
          messageType: "context_share",
        }, message.id);
        this.messageRouter.sendTo(message.from, response);
        return;
      }
      if (payload.content === "__nexus_query_agents") {
        const agents = this.agentRegistry.getAll().map(a => ({
          agentId: a.agentId,
          name: a.name,
          status: a.status,
          skills: a.skills,
          activeTasks: a.activeTasks.length,
          platform: a.platform,
        }));
        const response = this.createNexusMessage("peer.message", message.from, {
          content: JSON.stringify({ type: "agents_response", agents }),
          messageType: "context_share",
        }, message.id);
        this.messageRouter.sendTo(message.from, response);
        return;
      }
      this.messageRouter.sendToOrBroadcast(message, message.from);
    });

    // Peer review — forward to target
    this.messageRouter.onMessage("peer.review", (message) => {
      this.messageRouter.sendTo(message.to, message);
    });
  }

  private handleDisconnect(agentId: string): void {
    const agent = this.agentRegistry.deregister(agentId);
    this.messageRouter.unregisterSocket(agentId);

    if (agent) {
      // Only reassign if agent had active tasks
      const hadTasks = agent.activeTasks.length > 0;
      for (const taskId of agent.activeTasks) {
        this.taskEngine.reassign(taskId, `Agent ${agent.name} disconnected`);
      }

      // Notify remaining agents — only mention reassignment if there were tasks
      const content = hadTasks
        ? `Agent "${agent.name}" has left the nexus. ${agent.activeTasks.length} task(s) reassigned.`
        : `Agent "${agent.name}" has left the nexus.`;
      const notification = this.createNexusMessage("peer.message", "broadcast", {
        content,
        messageType: "chat",
      } satisfies PeerMessagePayload);
      this.messageRouter.broadcast(notification);
    }
  }

  private runHealthCheck(): void {
    const health = this.agentRegistry.checkHealthAll();

    for (const agentId of health.disconnected) {
      console.log(`[Nexus] Agent ${agentId} timed out — disconnecting`);
      this.handleDisconnect(agentId);
    }

    // Handle stale tasks
    const staleTasks = this.taskEngine.detectStaleTasks();
    for (const task of staleTasks) {
      console.log(
        `[Nexus] Task ${task.taskId} is stale — reassigning`,
      );
      this.taskEngine.reassign(task.taskId, "Stale task timeout");
    }

    // Check debate timeouts
    for (const debate of this.debateEngine.getActive()) {
      if (this.debateEngine.checkTimeout(debate.debateId)) {
        console.log(
          `[Nexus] Debate ${debate.debateId} timed out — auto-evaluating`,
        );
        const verdict = this.debateEngine.evaluate(debate.debateId);
        if (verdict) {
          for (const participant of debate.config.participants) {
            const verdictMsg = this.createNexusMessage(
              "debate.verdict",
              participant,
              verdict,
            );
            this.messageRouter.sendTo(participant, verdictMsg);
          }
        }
      }
    }
  }

  private createNexusMessage(
    type: NexusMessage["type"],
    to: string,
    payload: unknown,
    correlationId?: string,
  ): NexusMessage {
    return {
      id: generateMessageId(),
      type,
      from: "nexus",
      to,
      timestamp: Date.now(),
      correlationId,
      payload: payload as Record<string, unknown>,
    };
  }

  getStatus(): {
    version: string;
    agents: number;
    tasks: { total: number; queued: number; inProgress: number; completed: number };
    debates: { active: number };
    memory: { version: number };
  } {
    return {
      version: NEXUS_VERSION,
      agents: this.agentRegistry.size,
      tasks: {
        total: this.taskEngine.size,
        queued: this.taskEngine.getByStatus("queued").length,
        inProgress: this.taskEngine.getByStatus("in_progress").length,
        completed: this.taskEngine.getByStatus("completed").length,
      },
      debates: {
        active: this.debateEngine.getActive().length,
      },
      memory: {
        version: this.memoryStore.version,
      },
    };
  }
}
