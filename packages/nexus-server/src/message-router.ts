import type { NexusMessage, MessageType } from "@claude-nexus/core";
import type { WebSocket } from "ws";

export type MessageHandler = (
  message: NexusMessage,
  senderWs: WebSocket,
) => void | Promise<void>;

export class MessageRouter {
  private readonly handlers = new Map<MessageType, MessageHandler[]>();
  private readonly agentSockets = new Map<string, WebSocket>();

  onMessage(type: MessageType, handler: MessageHandler): void {
    const existing = this.handlers.get(type) || [];
    this.handlers.set(type, [...existing, handler]);
  }

  registerSocket(agentId: string, ws: WebSocket): void {
    this.agentSockets.set(agentId, ws);
  }

  unregisterSocket(agentId: string): void {
    this.agentSockets.delete(agentId);
  }

  getSocket(agentId: string): WebSocket | undefined {
    return this.agentSockets.get(agentId);
  }

  async route(message: NexusMessage, senderWs: WebSocket): Promise<void> {
    const handlers = this.handlers.get(message.type) || [];

    for (const handler of handlers) {
      try {
        await handler(message, senderWs);
      } catch (error) {
        console.error(
          `[MessageRouter] Error handling ${message.type}:`,
          error,
        );
      }
    }
  }

  sendTo(agentId: string, message: NexusMessage): boolean {
    const ws = this.agentSockets.get(agentId);
    if (!ws || ws.readyState !== 1) return false; // 1 = OPEN

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[MessageRouter] Failed to send to ${agentId}:`, error);
      return false;
    }
  }

  broadcast(message: NexusMessage, excludeAgentId?: string): number {
    let sent = 0;
    for (const [agentId, ws] of this.agentSockets) {
      if (agentId === excludeAgentId) continue;
      if (ws.readyState !== 1) continue;

      try {
        ws.send(JSON.stringify(message));
        sent++;
      } catch (error) {
        console.error(
          `[MessageRouter] Failed to broadcast to ${agentId}:`,
          error,
        );
      }
    }
    return sent;
  }

  sendToOrBroadcast(message: NexusMessage, excludeAgentId?: string): number {
    if (message.to === "broadcast") {
      return this.broadcast(message, excludeAgentId);
    }
    return this.sendTo(message.to, message) ? 1 : 0;
  }

  get connectedCount(): number {
    let count = 0;
    for (const ws of this.agentSockets.values()) {
      if (ws.readyState === 1) count++;
    }
    return count;
  }

  getConnectedAgentIds(): string[] {
    const ids: string[] = [];
    for (const [agentId, ws] of this.agentSockets) {
      if (ws.readyState === 1) ids.push(agentId);
    }
    return ids;
  }
}
