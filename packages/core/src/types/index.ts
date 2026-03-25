export type {
  AgentStatus,
  Platform,
  AgentRegistration,
  AgentRecord,
  AgentLoad,
  AgentSummary,
  AgentConfig,
} from "./agent.js";

export type {
  TaskStatus,
  TaskPriority,
  TaskSubmission,
  TaskRecord,
  TaskResult,
  Artifact,
  SubtaskDefinition,
} from "./task.js";

export type {
  MessageType,
  NexusMessage,
  AgentRegisterPayload,
  AgentRegisteredPayload,
  HeartbeatPayload,
  TaskSubmitPayload,
  TaskAssignedPayload,
  TaskResultPayload,
  DebateArgumentPayload,
  ExecRequestPayload,
  ExecResultPayload,
  PeerMessagePayload,
  NexusErrorPayload,
} from "./message.js";

export type {
  DebateTrigger,
  DebateOutcome,
  DebateConfig,
  DebateSession,
  Argument,
  Rebuttal,
  Verdict,
} from "./debate.js";

export type {
  MemoryScope,
  MemoryEntry,
  MemorySnapshot,
} from "./memory.js";

export type {
  ExecRequest,
  ExecResult,
  ExecChunk,
  MachineCapabilities,
} from "./execution.js";
