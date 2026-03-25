import type { MessageInbox, InboxMessage } from "../inbox.js";
import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import type { NexusMessage } from "@claude-nexus/core";

/**
 * Query the server-side persisted inbox via __nexus_query_inbox.
 * Returns messages that were persisted while this agent was offline.
 */
function queryPersistedInbox(runtime: AgentRuntime): Promise<InboxMessage[]> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve([]);
    }, 5000);

    const handler = (message: NexusMessage) => {
      const payload = message.payload as { content?: string; messageType?: string };
      if (message.type === "peer.message" && payload.messageType === "context_share") {
        try {
          const data = JSON.parse(payload.content || "");
          if (data.type === "inbox_response") {
            clearTimeout(timeout);
            runtime.removeListener("message", handler);
            const messages: InboxMessage[] = (data.messages || []).map((m: {
              messageId: string;
              fromAgent: string;
              content: string;
              messageType: string;
              createdAt: number;
            }) => ({
              id: m.messageId,
              from: m.fromAgent,
              type: m.messageType,
              content: m.content,
              timestamp: m.createdAt,
              read: false,
            }));
            resolve(messages);
          }
        } catch {
          /* not our response */
        }
      }
    };

    runtime.on("message", handler);
    runtime.sendMessage("peer.message", "nexus", {
      content: "__nexus_query_inbox",
      messageType: "chat",
    });
  });
}

export function createReadInboxTool(inbox: MessageInbox, runtime: AgentRuntime) {
  return {
    name: "nexus_read_inbox",
    description: "Read messages from other agents. Shows unread messages by default. Use this to check if anyone has sent you messages, task assignments, or debate invitations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        show_all: { type: "boolean", description: "Show all messages including already read ones" },
        mark_read: { type: "boolean", description: "Mark messages as read after viewing (default: true)" },
      },
    },
    handler: async (args: { show_all?: boolean; mark_read?: boolean }) => {
      const markRead = args.mark_read !== false; // Default true

      // Get local real-time messages
      const localMessages = args.show_all ? inbox.getAll() : inbox.getUnread();

      // Query server-side persisted inbox for offline messages
      let serverMessages: InboxMessage[] = [];
      const state = runtime.getState();
      if (state === "connected") {
        serverMessages = await queryPersistedInbox(runtime);
      }

      // Merge and deduplicate by message ID
      const seenIds = new Set<string>();
      const merged: InboxMessage[] = [];

      for (const msg of localMessages) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          merged.push(msg);
        }
      }
      for (const msg of serverMessages) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          merged.push(msg);
        }
      }

      // Sort by timestamp descending (newest first)
      merged.sort((a, b) => b.timestamp - a.timestamp);

      if (merged.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: args.show_all
              ? "Inbox is empty. No messages received yet."
              : `No unread messages. (${inbox.getAll().length} total in inbox)`,
          }],
        };
      }

      let text = `${args.show_all ? "All" : "Unread"} Messages (${merged.length}):\n\n`;
      for (const msg of merged) {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const readIndicator = msg.read ? "[read]" : "[new]";
        text += `${readIndicator} [${time}] From: ${msg.from} (${msg.type})\n`;
        text += `  ${msg.content}\n\n`;
      }

      if (markRead) {
        inbox.markAllRead();
        text += `\n(All messages marked as read)`;
      }

      return { content: [{ type: "text" as const, text }] };
    },
  };
}
