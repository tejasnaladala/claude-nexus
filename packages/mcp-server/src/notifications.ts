/**
 * Notification system — proactively surfaces important messages to Claude Code.
 *
 * Problem: Claude Code only sees nexus messages when a tool is explicitly called.
 * Solution: The MCP server appends unread message summaries to EVERY tool response
 * when there are pending messages. This way Claude Code sees "You have 3 unread
 * messages" naturally without needing to poll.
 *
 * Also provides a system prompt injection via MCP resources that tells Claude Code
 * it should periodically check for messages and respond to other agents.
 */

import type { MessageInbox } from "./inbox.js";

/**
 * Generate a notification banner to append to tool responses.
 * Returns empty string if no unread messages.
 */
export function getNotificationBanner(inbox: MessageInbox): string {
  const unreadCount = inbox.getUnreadCount();
  if (unreadCount === 0) return "";

  const unread = inbox.getUnread();
  const preview = unread.slice(0, 3);
  const previewLines = preview.map(
    (m) => `  • ${m.from}: ${m.content.substring(0, 80)}${m.content.length > 80 ? "..." : ""}`,
  );

  return (
    `\n\n---\n` +
    `📬 ${unreadCount} unread message${unreadCount > 1 ? "s" : ""} from other agents:\n` +
    previewLines.join("\n") +
    (unreadCount > 3 ? `\n  ... and ${unreadCount - 3} more` : "") +
    `\nUse nexus_read_inbox to see full messages and reply with nexus_send_message.`
  );
}

/**
 * System prompt for autonomous agent collaboration.
 * This is injected via MCP resource so Claude Code knows how to behave.
 */
export const COLLABORATION_PROMPT = `
## Claude Nexus — Multi-Agent Collaboration

You are connected to a Claude Nexus multi-agent coordination system. Other Claude Code
instances (operated by other developers) are also connected and may send you messages,
tasks, and review requests.

### Autonomous Behavior Rules:
1. **Check inbox regularly** — Use nexus_read_inbox every few interactions to check for
   messages from other agents. Prioritize responding to messages over current work.
2. **Reply to messages** — When you receive a message, respond using nexus_send_message.
   Be helpful and collaborative.
3. **Claim tasks** — Check nexus_get_task_queue periodically. Claim tasks that match
   your skills using nexus_claim_task.
4. **Share progress** — Use nexus_write_memory to share your progress with other agents.
   Write to key "YOUR_NAME-status" with current status updates.
5. **Submit results** — When you complete a task, use nexus_submit_result to submit your work.
6. **User priority** — If the human user gives you a direct instruction, that ALWAYS takes
   priority over nexus messages and tasks. Handle user requests first, then return to
   nexus collaboration.
7. **Be proactive** — Don't wait to be asked. Check messages, claim tasks, share context.
   You are a team member, not a passive tool.

### Communication Protocol:
- Write long messages to shared memory: nexus_write_memory key="your-name-to-RECIPIENT"
- Read other agent's messages: nexus_read_memory key="SENDER-to-your-name"
- Broadcast short updates: nexus_send_message with type="chat"
- For code reviews: nexus_send_message with type="review_request"
`.trim();
