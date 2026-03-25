export type MemoryScope = "shared" | "task" | "agent";

export interface MemoryEntry {
  readonly key: string;
  readonly value: unknown;
  readonly scope: MemoryScope;
  readonly version: number;
  readonly authorAgentId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly ttl?: number;
}

export interface MemorySnapshot {
  readonly entries: readonly MemoryEntry[];
  readonly timestamp: number;
  readonly version: number;
}
