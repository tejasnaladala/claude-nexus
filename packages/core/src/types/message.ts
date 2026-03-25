export type MessageType =
  // Agent lifecycle
  | "agent.register"
  | "agent.registered"
  | "agent.heartbeat"
  | "agent.heartbeat_ack"
  | "agent.deregister"
  // Task management
  | "task.submit"
  | "task.submitted"
  | "task.assigned"
  | "task.claimed"
  | "task.result"
  | "task.completed"
  | "task.failed"
  | "task.reassigned"
  // Debate
  | "debate.initiate"
  | "debate.initiated"
  | "debate.argument"
  | "debate.rebuttal"
  | "debate.verdict"
  // Memory
  | "memory.write"
  | "memory.read"
  | "memory.read_result"
  | "memory.sync"
  // Execution
  | "exec.request"
  | "exec.result"
  | "exec.stream"
  // Peer communication
  | "peer.message"
  | "peer.review"
  // System
  | "nexus.election"
  | "nexus.migration"
  | "nexus.error";

export interface NexusMessage<T = Record<string, unknown>> {
  readonly id: string;
  readonly type: MessageType;
  readonly from: string;
  readonly to: string;
  readonly timestamp: number;
  readonly correlationId?: string;
  readonly payload: T;
}

export interface AgentRegisterPayload {
  readonly name: string;
  readonly developerId: string;
  readonly skills: readonly string[];
  readonly platform: "darwin" | "win32" | "linux";
  readonly maxConcurrentTasks: number;
  readonly a2aEndpoint?: string;
  readonly publicKey?: string;
}

export interface AgentRegisteredPayload {
  readonly agentId: string;
  readonly nexusVersion: string;
  readonly connectedAgents: ReadonlyArray<{
    readonly agentId: string;
    readonly name: string;
    readonly status: string;
    readonly skills: readonly string[];
  }>;
  readonly memorySnapshot: Readonly<Record<string, unknown>>;
}

export interface HeartbeatPayload {
  readonly agentId: string;
  readonly status: "idle" | "working" | "debating";
  readonly activeTasks: readonly string[];
  readonly cpuLoad: number;
  readonly memoryUsage: number;
  readonly uptime: number;
}

export interface TaskSubmitPayload {
  readonly title: string;
  readonly description: string;
  readonly priority: "critical" | "high" | "medium" | "low";
  readonly skillsRequired: readonly string[];
  readonly constraints?: string;
  readonly parentTaskId?: string;
  readonly autoReview: boolean;
  readonly artifacts?: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly content: string;
    readonly encoding: string;
    readonly size: number;
    readonly hash: string;
  }>;
}

export interface TaskAssignedPayload {
  readonly taskId: string;
  readonly task: Readonly<Record<string, unknown>>;
  readonly assignedBy: string;
  readonly reason: string;
}

export interface TaskResultPayload {
  readonly taskId: string;
  readonly result: string;
  readonly artifacts: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly content: string;
    readonly encoding: string;
    readonly size: number;
    readonly hash: string;
  }>;
  readonly confidence: number;
  readonly executionTimeMs: number;
  readonly notes?: string;
}

export interface DebateArgumentPayload {
  readonly debateId: string;
  readonly round: number;
  readonly position: string;
  readonly reasoning: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
  readonly isRebuttal: boolean;
  readonly targetArgumentId?: string;
}

export interface ExecRequestPayload {
  readonly targetAgentId: string;
  readonly command: string;
  readonly workingDirectory?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly stream: boolean;
}

export interface ExecResultPayload {
  readonly requestId: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface PeerMessagePayload {
  readonly content: string;
  readonly messageType: "chat" | "question" | "review_request" | "context_share";
}

export interface NexusErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
