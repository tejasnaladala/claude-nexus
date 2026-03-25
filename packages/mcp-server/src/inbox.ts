/**
 * Message inbox — stores incoming peer messages so MCP tools can read them.
 *
 * Without this, messages arrive at the runtime EventEmitter but get dropped
 * because no MCP tool is actively listening at that moment.
 */

import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import type { NexusMessage } from "@claude-nexus/core";

export interface InboxMessage {
  id: string;
  from: string;
  type: string;
  content: string;
  timestamp: number;
  read: boolean;
}

export class MessageInbox {
  private messages: InboxMessage[] = [];
  private maxSize = 100;

  constructor(runtime: AgentRuntime) {
    // Listen for ALL incoming messages and store peer messages
    runtime.on("message", (message: NexusMessage) => {
      if (message.type === "peer.message") {
        const payload = message.payload as { content?: string; messageType?: string };
        // Skip internal nexus query responses
        if (payload.content?.startsWith("__nexus_query")) return;
        try {
          // Skip JSON responses from nexus queries
          const parsed = JSON.parse(payload.content || "");
          if (parsed.type && parsed.type.endsWith("_response")) return;
        } catch {
          // Not JSON — it's a real message, store it
        }

        this.messages.push({
          id: message.id,
          from: message.from,
          type: payload.messageType || "chat",
          content: payload.content || "",
          timestamp: message.timestamp,
          read: false,
        });

        // Trim to max size
        if (this.messages.length > this.maxSize) {
          this.messages = this.messages.slice(-this.maxSize);
        }
      }

      // Also capture task assignments
      if (message.type === "task.assigned") {
        const payload = message.payload as { taskId?: string; reason?: string; task?: { title?: string } };
        this.messages.push({
          id: message.id,
          from: "nexus",
          type: "task_assignment",
          content: `Task assigned: ${payload.task?.title || payload.taskId} — ${payload.reason || ""}`,
          timestamp: message.timestamp,
          read: false,
        });
      }

      // Capture debate initiations
      if (message.type === "debate.initiated") {
        const payload = message.payload as { debateId?: string; config?: { topic?: string } };
        this.messages.push({
          id: message.id,
          from: "nexus",
          type: "debate",
          content: `Debate started: ${payload.config?.topic || payload.debateId}`,
          timestamp: message.timestamp,
          read: false,
        });
      }
    });
  }

  getUnread(): InboxMessage[] {
    return this.messages.filter((m) => !m.read);
  }

  getAll(): InboxMessage[] {
    return [...this.messages];
  }

  markAllRead(): void {
    this.messages = this.messages.map((m) => ({ ...m, read: true }));
  }

  getUnreadCount(): number {
    return this.messages.filter((m) => !m.read).length;
  }

  clear(): void {
    this.messages = [];
  }
}
