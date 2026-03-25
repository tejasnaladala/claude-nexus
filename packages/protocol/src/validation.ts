import { z } from "zod";
import type { NexusMessage, MessageType } from "@claude-nexus/core";
import * as schemas from "./schemas/index.js";

const MESSAGE_SCHEMAS: Partial<Record<MessageType, z.ZodSchema>> = {
  "agent.register": schemas.AgentRegisterSchema,
  "agent.registered": schemas.AgentRegisteredSchema,
  "agent.heartbeat": schemas.HeartbeatSchema,
  "task.submit": schemas.TaskSubmitSchema,
  "task.assigned": schemas.TaskAssignedSchema,
  "task.result": schemas.TaskResultSchema,
  "task.claimed": schemas.TaskClaimedSchema,
  "debate.initiate": schemas.DebateInitiateSchema,
  "debate.argument": schemas.DebateArgumentSchema,
  "debate.verdict": schemas.DebateVerdictSchema,
  "memory.write": schemas.MemoryWriteSchema,
  "memory.read": schemas.MemoryReadSchema,
  "exec.request": schemas.ExecRequestSchema,
  "exec.result": schemas.ExecResultSchema,
};

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors?: z.ZodError;
  readonly data?: unknown;
}

export function validatePayload(
  type: MessageType,
  payload: unknown,
): ValidationResult {
  const schema = MESSAGE_SCHEMAS[type];

  if (!schema) {
    return { valid: true, data: payload };
  }

  const result = schema.safeParse(payload);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  return { valid: false, errors: result.error };
}

export function validateMessage(message: NexusMessage): ValidationResult {
  if (!message.id || !message.type || !message.from || !message.timestamp) {
    return {
      valid: false,
      errors: new z.ZodError([
        {
          code: "custom",
          message: "Missing required envelope fields",
          path: [],
        },
      ]),
    };
  }

  return validatePayload(message.type, message.payload);
}
