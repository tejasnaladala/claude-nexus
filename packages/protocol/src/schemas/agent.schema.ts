import { z } from "zod";

export const PlatformSchema = z.enum(["darwin", "win32", "linux"]);

export const AgentRegisterSchema = z.object({
  name: z.string().min(1).max(64),
  developerId: z.string().min(1),
  skills: z.array(z.string()).min(1),
  platform: PlatformSchema,
  maxConcurrentTasks: z.number().int().min(1).max(10).default(2),
  a2aEndpoint: z.string().url().optional(),
  publicKey: z.string().optional(),
});

export const AgentRegisteredSchema = z.object({
  agentId: z.string(),
  nexusVersion: z.string(),
  connectedAgents: z.array(
    z.object({
      agentId: z.string(),
      name: z.string(),
      status: z.string(),
      skills: z.array(z.string()),
    }),
  ),
  memorySnapshot: z.record(z.unknown()),
});

export const HeartbeatSchema = z.object({
  agentId: z.string(),
  status: z.enum(["idle", "working", "debating"]),
  activeTasks: z.array(z.string()),
  cpuLoad: z.number().min(0).max(1),
  memoryUsage: z.number().min(0).max(1),
  uptime: z.number(),
});

export type AgentRegisterInput = z.infer<typeof AgentRegisterSchema>;
export type AgentRegisteredInput = z.infer<typeof AgentRegisteredSchema>;
export type HeartbeatInput = z.infer<typeof HeartbeatSchema>;
