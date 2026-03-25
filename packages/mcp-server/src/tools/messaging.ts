import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import { queryNexus } from "./status.js";

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
            ? `✅ Message sent to ${args.to || "all agents"}.`
            : "❌ Failed to send message — not connected to nexus.",
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
      const raw = await queryNexus(runtime, "__nexus_query_agents");

      try {
        const data = JSON.parse(raw);
        const agents = data.agents || [];
        const myId = runtime.getAgentId();

        if (agents.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No agents connected to the nexus.",
            }],
          };
        }

        let text = `👥 Connected Agents (${agents.length}):\n\n`;
        for (const a of agents) {
          const isMe = a.agentId === myId ? " ← YOU" : "";
          text += `• ${a.name}${isMe}\n`;
          text += `  ID: ${a.agentId}\n`;
          text += `  Status: ${a.status} | Platform: ${a.platform} | Active tasks: ${a.activeTasks}\n`;
          text += `  Skills: ${a.skills.join(", ")}\n\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch {
        return {
          content: [{
            type: "text" as const,
            text: "Failed to parse agent list. Raw: " + raw,
          }],
        };
      }
    },
  };
}
