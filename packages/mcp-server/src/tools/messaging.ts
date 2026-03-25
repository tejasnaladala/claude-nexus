import type { AgentRuntime } from "@claude-nexus/agent-runtime";

export function createSendMessageTool(runtime: AgentRuntime) {
  return {
    name: "nexus_send_message",
    description: "Send a message to another agent or broadcast to all agents",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Agent ID or 'broadcast'" },
        content: { type: "string", description: "Message content" },
        type: { type: "string", enum: ["chat", "question", "review_request", "context_share"], description: "Message type" },
      },
      required: ["content", "type"],
    },
    handler: async (args: { to?: string; content: string; type: string }) => {
      const sent = runtime.sendMessage("peer.message", args.to || "broadcast", {
        content: args.content,
        messageType: args.type,
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `Message sent to ${args.to || "all agents"}.`
            : "Failed to send message — not connected to nexus.",
        }],
      };
    },
  };
}

export function createListAgentsTool(runtime: AgentRuntime) {
  return {
    name: "nexus_list_agents",
    description: "List all connected agents with their capabilities and status",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    handler: async () => {
      // We'd need to query the nexus for this — for now emit a request
      runtime.sendMessage("peer.message", "nexus", {
        content: "list_agents_request",
        messageType: "chat",
      });
      return {
        content: [{
          type: "text" as const,
          text: `Agent listing requested. This agent ID: ${runtime.getAgentId() || "not connected"}.`,
        }],
      };
    },
  };
}
