import { z } from "zod";

export const DebateInitiateSchema = z.object({
  topic: z.string().min(1),
  context: z.string().default(""),
  taskId: z.string().optional(),
  participants: z.array(z.string()).min(2).optional(),
  maxRounds: z.number().int().min(1).max(10).default(3),
  timeoutPerRoundMs: z.number().int().min(5000).default(60000),
  consensusThreshold: z.number().min(0).max(1).default(0.7),
  triggerType: z
    .enum(["manual", "auto_review", "conflict", "high_stakes"])
    .default("manual"),
});

export const DebateArgumentSchema = z.object({
  debateId: z.string(),
  round: z.number().int().min(1),
  position: z.string().min(1),
  reasoning: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  isRebuttal: z.boolean().default(false),
  targetArgumentId: z.string().optional(),
});

export const DebateVerdictSchema = z.object({
  debateId: z.string(),
  outcome: z.enum(["consensus", "majority", "tiebreak", "timeout"]),
  winningPosition: z.string(),
  reasoning: z.string(),
  votes: z.record(
    z.object({
      position: z.string(),
      confidence: z.number(),
    }),
  ),
  round: z.number().int(),
  resolvedAt: z.number(),
});

export type DebateInitiateInput = z.infer<typeof DebateInitiateSchema>;
export type DebateArgumentInput = z.infer<typeof DebateArgumentSchema>;
