import type {
  AgentRecord,
  AgentRegistration,
  AgentSummary,
  AgentStatus,
} from "@claude-nexus/core";
import { generateAgentId } from "@claude-nexus/core";
import {
  HEARTBEAT_MISS_THRESHOLD,
  HEARTBEAT_DISCONNECT_THRESHOLD,
  HEARTBEAT_INTERVAL_MS,
} from "@claude-nexus/core";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentRecord>();

  register(registration: AgentRegistration): AgentRecord {
    const agentId = generateAgentId();
    const now = Date.now();

    const record: AgentRecord = {
      agentId,
      name: registration.name,
      developerId: registration.developerId,
      skills: [...registration.skills],
      platform: registration.platform,
      status: "ready",
      maxConcurrentTasks: registration.maxConcurrentTasks,
      activeTasks: [],
      a2aEndpoint: registration.a2aEndpoint,
      connectedAt: now,
      lastHeartbeat: now,
      latencyMs: 0,
      load: {
        activeTasks: 0,
        maxTasks: registration.maxConcurrentTasks,
        avgCompletionTimeMs: 0,
        successRate: 1,
        cpuLoad: 0,
        memoryUsage: 0,
        lastHeartbeat: now,
      },
    };

    this.agents.set(agentId, record);
    return record;
  }

  deregister(agentId: string): AgentRecord | undefined {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
    }
    return agent;
  }

  get(agentId: string): AgentRecord | undefined {
    return this.agents.get(agentId);
  }

  getAll(): AgentRecord[] {
    return Array.from(this.agents.values());
  }

  getByStatus(status: AgentStatus): AgentRecord[] {
    return this.getAll().filter((a) => a.status === status);
  }

  getSummaries(): AgentSummary[] {
    return this.getAll().map((a) => ({
      agentId: a.agentId,
      name: a.name,
      status: a.status,
      skills: a.skills,
      activeTasks: a.activeTasks.length,
    }));
  }

  updateHeartbeat(
    agentId: string,
    heartbeat: {
      status: "idle" | "working" | "debating";
      activeTasks: string[];
      cpuLoad: number;
      memoryUsage: number;
    },
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const now = Date.now();
    const latencyMs = now - agent.lastHeartbeat - HEARTBEAT_INTERVAL_MS;

    const updatedAgent: AgentRecord = {
      ...agent,
      status: heartbeat.status === "idle" ? "ready" : heartbeat.status,
      activeTasks: [...heartbeat.activeTasks],
      lastHeartbeat: now,
      latencyMs: Math.max(0, latencyMs),
      load: {
        ...agent.load,
        activeTasks: heartbeat.activeTasks.length,
        cpuLoad: heartbeat.cpuLoad,
        memoryUsage: heartbeat.memoryUsage,
        lastHeartbeat: now,
      },
    };

    this.agents.set(agentId, updatedAgent);
  }

  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.set(agentId, { ...agent, status });
  }

  addActiveTask(agentId: string, taskId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.set(agentId, {
      ...agent,
      activeTasks: [...agent.activeTasks, taskId],
      status: "working",
      load: {
        ...agent.load,
        activeTasks: agent.activeTasks.length + 1,
      },
    });
  }

  removeActiveTask(agentId: string, taskId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const activeTasks = agent.activeTasks.filter((t) => t !== taskId);
    this.agents.set(agentId, {
      ...agent,
      activeTasks,
      status: activeTasks.length === 0 ? "ready" : "working",
      load: {
        ...agent.load,
        activeTasks: activeTasks.length,
      },
    });
  }

  checkHealthAll(): { healthy: string[]; unhealthy: string[]; disconnected: string[] } {
    const now = Date.now();
    const healthy: string[] = [];
    const unhealthy: string[] = [];
    const disconnected: string[] = [];

    for (const agent of this.agents.values()) {
      const missedBeats = Math.floor(
        (now - agent.lastHeartbeat) / HEARTBEAT_INTERVAL_MS,
      );

      if (missedBeats >= HEARTBEAT_DISCONNECT_THRESHOLD) {
        disconnected.push(agent.agentId);
        this.agents.set(agent.agentId, { ...agent, status: "failed" });
      } else if (missedBeats >= HEARTBEAT_MISS_THRESHOLD) {
        unhealthy.push(agent.agentId);
      } else {
        healthy.push(agent.agentId);
      }
    }

    return { healthy, unhealthy, disconnected };
  }

  findBestForSkills(requiredSkills: string[]): AgentRecord | undefined {
    const ready = this.getByStatus("ready");
    if (ready.length === 0) return undefined;

    let bestAgent: AgentRecord | undefined;
    let bestScore = -1;

    for (const agent of ready) {
      if (agent.load.activeTasks >= agent.maxConcurrentTasks) continue;

      const skillMatch =
        requiredSkills.length === 0
          ? 1
          : requiredSkills.filter((s) => agent.skills.includes(s)).length /
            requiredSkills.length;
      const loadFactor =
        1 - agent.load.activeTasks / agent.load.maxTasks;
      const successFactor = agent.load.successRate;
      const latencyFactor = 1 / (1 + agent.latencyMs / 100);

      const score =
        skillMatch * 0.4 +
        loadFactor * 0.3 +
        successFactor * 0.2 +
        latencyFactor * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  get size(): number {
    return this.agents.size;
  }
}
