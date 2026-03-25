import { v7 as uuidv7 } from "uuid";

export function generateId(): string {
  return uuidv7();
}

export function generateAgentId(): string {
  return `agent-${uuidv7()}`;
}

export function generateTaskId(): string {
  return `task-${uuidv7()}`;
}

export function generateDebateId(): string {
  return `debate-${uuidv7()}`;
}

export function generateMessageId(): string {
  return uuidv7();
}
