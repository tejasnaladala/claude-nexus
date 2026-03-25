export type AgentStatus =
  | "initializing"
  | "discovering"
  | "connecting"
  | "registering"
  | "ready"
  | "working"
  | "debating"
  | "disconnecting"
  | "reconnecting"
  | "failed";

export type Platform = "darwin" | "win32" | "linux";

export interface AgentRegistration {
  readonly name: string;
  readonly developerId: string;
  readonly skills: readonly string[];
  readonly platform: Platform;
  readonly maxConcurrentTasks: number;
  readonly a2aEndpoint?: string;
  readonly publicKey?: string;
}

export interface AgentRecord {
  readonly agentId: string;
  readonly name: string;
  readonly developerId: string;
  readonly skills: readonly string[];
  readonly platform: Platform;
  readonly status: AgentStatus;
  readonly maxConcurrentTasks: number;
  readonly activeTasks: readonly string[];
  readonly a2aEndpoint?: string;
  readonly connectedAt: number;
  readonly lastHeartbeat: number;
  readonly latencyMs: number;
  readonly load: AgentLoad;
}

export interface AgentLoad {
  readonly activeTasks: number;
  readonly maxTasks: number;
  readonly avgCompletionTimeMs: number;
  readonly successRate: number;
  readonly cpuLoad: number;
  readonly memoryUsage: number;
  readonly lastHeartbeat: number;
}

export interface AgentSummary {
  readonly agentId: string;
  readonly name: string;
  readonly status: AgentStatus;
  readonly skills: readonly string[];
  readonly activeTasks: number;
}

export interface AgentConfig {
  readonly name: string;
  readonly skills: readonly string[];
  readonly nexusUrl?: string;
  readonly port: number;
  readonly tunnelProvider?: "bore" | "cloudflared" | "none";
  readonly maxConcurrentTasks: number;
  readonly executionAllowlist: readonly string[];
}
