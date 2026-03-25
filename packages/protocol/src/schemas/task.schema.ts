import { z } from "zod";

export const TaskPrioritySchema = z.enum(["critical", "high", "medium", "low"]);

export const ArtifactSchema = z.object({
  name: z.string(),
  type: z.enum(["file", "code", "data", "image"]),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]),
  size: z.number().int().min(0),
  hash: z.string(),
});

export const TaskSubmitSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: TaskPrioritySchema.default("medium"),
  skillsRequired: z.array(z.string()).default([]),
  constraints: z.string().optional(),
  parentTaskId: z.string().optional(),
  autoReview: z.boolean().default(true),
  artifacts: z.array(ArtifactSchema).default([]),
});

export const TaskAssignedSchema = z.object({
  taskId: z.string(),
  task: z.record(z.unknown()),
  assignedBy: z.string(),
  reason: z.string(),
});

export const TaskResultSchema = z.object({
  taskId: z.string(),
  result: z.string(),
  artifacts: z.array(ArtifactSchema).default([]),
  confidence: z.number().min(0).max(1),
  executionTimeMs: z.number().int().min(0),
  notes: z.string().optional(),
});

export const TaskClaimedSchema = z.object({
  taskId: z.string(),
  estimatedDuration: z.string().optional(),
});

export type TaskSubmitInput = z.infer<typeof TaskSubmitSchema>;
export type TaskResultInput = z.infer<typeof TaskResultSchema>;
