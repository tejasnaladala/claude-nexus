import { z } from "zod";

export const MemoryScopeSchema = z.enum(["shared", "task", "agent"]);

export const MemoryWriteSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.unknown(),
  scope: MemoryScopeSchema.default("shared"),
  ttl: z.number().int().positive().optional(),
});

export const MemoryReadSchema = z.object({
  key: z.string().min(1),
  scope: MemoryScopeSchema.default("shared"),
});

export const MemoryEntrySchema = z.object({
  key: z.string(),
  value: z.unknown(),
  scope: MemoryScopeSchema,
  version: z.number().int(),
  authorAgentId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  ttl: z.number().int().optional(),
});

export const MemorySnapshotSchema = z.object({
  entries: z.array(MemoryEntrySchema),
  timestamp: z.number(),
  version: z.number().int(),
});

export type MemoryWriteInput = z.infer<typeof MemoryWriteSchema>;
export type MemoryReadInput = z.infer<typeof MemoryReadSchema>;
