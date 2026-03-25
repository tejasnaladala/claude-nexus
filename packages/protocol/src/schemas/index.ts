export {
  PlatformSchema,
  AgentRegisterSchema,
  AgentRegisteredSchema,
  HeartbeatSchema,
  type AgentRegisterInput,
  type AgentRegisteredInput,
  type HeartbeatInput,
} from "./agent.schema.js";

export {
  TaskPrioritySchema,
  ArtifactSchema,
  TaskSubmitSchema,
  TaskAssignedSchema,
  TaskResultSchema,
  TaskClaimedSchema,
  type TaskSubmitInput,
  type TaskResultInput,
} from "./task.schema.js";

export {
  DebateInitiateSchema,
  DebateArgumentSchema,
  DebateVerdictSchema,
  type DebateInitiateInput,
  type DebateArgumentInput,
} from "./debate.schema.js";

export {
  MemoryScopeSchema,
  MemoryWriteSchema,
  MemoryReadSchema,
  MemoryEntrySchema,
  MemorySnapshotSchema,
  type MemoryWriteInput,
  type MemoryReadInput,
} from "./memory.schema.js";

export {
  ExecRequestSchema,
  ExecResultSchema,
  type ExecRequestInput,
  type ExecResultInput,
} from "./execution.schema.js";
