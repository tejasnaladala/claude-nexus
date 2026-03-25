import type { MessageInbox } from "../inbox.js";

export function createReadInboxTool(inbox: MessageInbox) {
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
      const messages = args.show_all ? inbox.getAll() : inbox.getUnread();
      const markRead = args.mark_read !== false; // Default true

      if (messages.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: args.show_all
              ? "📭 Inbox is empty. No messages received yet."
              : `📭 No unread messages. (${inbox.getAll().length} total in inbox)`,
          }],
        };
      }

      let text = `📬 ${args.show_all ? "All" : "Unread"} Messages (${messages.length}):\n\n`;
      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const readIndicator = msg.read ? "✓" : "●";
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
