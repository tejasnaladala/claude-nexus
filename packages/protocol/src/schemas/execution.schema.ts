import { z } from "zod";

export const ExecRequestSchema = z.object({
  targetAgentId: z.string(),
  command: z.string().min(1),
  workingDirectory: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(60000),
  stream: z.boolean().default(false),
});

export const ExecResultSchema = z.object({
  requestId: z.string(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int(),
});

export type ExecRequestInput = z.infer<typeof ExecRequestSchema>;
export type ExecResultInput = z.infer<typeof ExecResultSchema>;
