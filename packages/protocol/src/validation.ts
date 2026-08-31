import { z } from "zod";
import type { NexusMessage, MessageType } from "@claude-nexus/core";
import * as schemas from "./schemas/index.js";

const InboundMessageTypeSchema = z.enum([
  "agent.register",
  "agent.heartbeat",
  "agent.deregister",
  "task.submit",
  "task.result",
  "task.claimed",
  "debate.initiate",
  "debate.argument",
  "memory.write",
  "memory.read",
  "exec.request",
  "exec.result",
  "peer.message",
]);

const MessageEnvelopeSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: InboundMessageTypeSchema,
    from: z.string().min(1).max(128),
    to: z.string().min(1).max(128),
    timestamp: z.number().int().nonnegative(),
    correlationId: z.string().min(1).max(128).optional(),
    payload: z.unknown(),
  })
  .strict();

const AgentRegisterInboundSchema = schemas.AgentRegisterSchema.extend({
  silent: z.boolean().optional(),
}).strict();

const AgentDeregisterSchema = z
  .object({ agentId: z.string().min(1).max(128) })
  .strict();

const PeerMessageSchema = z
  .object({
    content: z.string().min(1).max(32_768),
    messageType: z.enum([
      "chat",
      "question",
      "review_request",
      "context_share",
    ]),
    filter: z.enum(["all", "available", "mine"]).optional(),
  })
  .strict();

const MESSAGE_SCHEMAS: Partial<Record<MessageType, z.ZodTypeAny>> = {
  "agent.register": AgentRegisterInboundSchema,
  "agent.heartbeat": schemas.HeartbeatSchema.strict(),
  "agent.deregister": AgentDeregisterSchema,
  "task.submit": schemas.TaskSubmitSchema.strict(),
  "task.result": schemas.TaskResultSchema.strict(),
  "task.claimed": schemas.TaskClaimedSchema.strict(),
  "debate.initiate": schemas.DebateInitiateSchema.strict(),
  "debate.argument": schemas.DebateArgumentSchema.strict(),
  "memory.write": schemas.MemoryWriteSchema.strict(),
  "memory.read": schemas.MemoryReadSchema.strict(),
  "exec.request": schemas.ExecRequestSchema.strict(),
  "exec.result": schemas.ExecResultSchema.strict(),
  "peer.message": PeerMessageSchema,
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
    return {
      valid: false,
      errors: validationError(`Unsupported inbound message type: ${type}`, [
        "type",
      ]),
    };
  }

  const result = schema.safeParse(payload);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  return { valid: false, errors: result.error };
}

export function validateMessage(message: unknown): ValidationResult {
  const envelope = MessageEnvelopeSchema.safeParse(message);
  if (!envelope.success) {
    return { valid: false, errors: envelope.error };
  }

  const payload = validatePayload(
    envelope.data.type as MessageType,
    envelope.data.payload,
  );
  if (!payload.valid) return payload;

  return {
    valid: true,
    data: {
      ...envelope.data,
      payload: payload.data as Record<string, unknown>,
    } satisfies NexusMessage,
  };
}

function validationError(
  message: string,
  path: Array<string | number>,
): z.ZodError {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      message,
      path,
    },
  ]);
}
