import { generateMessageId } from "@claude-nexus/core";
import type { NexusMessage, MessageType } from "@claude-nexus/core";

export function encodeMessage(message: NexusMessage): string {
  return JSON.stringify(message);
}

export function decodeMessage(raw: string): NexusMessage {
  const parsed = JSON.parse(raw);

  if (!parsed.id || !parsed.type || !parsed.from || !parsed.timestamp) {
    throw new Error("Invalid message envelope: missing required fields");
  }

  return parsed as NexusMessage;
}

export function createMessage<T>(
  type: MessageType,
  from: string,
  to: string,
  payload: T,
  correlationId?: string,
): NexusMessage<T> {
  return {
    id: generateMessageId(),
    type,
    from,
    to,
    timestamp: Date.now(),
    correlationId,
    payload,
  };
}
