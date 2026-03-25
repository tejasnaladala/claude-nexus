import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import type { NexusMessage } from "@claude-nexus/core";
import type { MessageInbox } from "../inbox.js";

function queryNexus(runtime: AgentRuntime, queryContent: string, extra?: Record<string, unknown>): Promise<string> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(JSON.stringify({ error: "Nexus query timed out" }));
    }, 5000);

    const handler = (message: NexusMessage) => {
      const payload = message.payload as any;
      if (message.type === "peer.message" && payload.messageType === "context_share") {
        try {
          const data = JSON.parse(payload.content);
          if (data.type) {
            clearTimeout(timeout);
            runtime.removeListener("message", handler);
            resolve(payload.content);
          }
        } catch { /* not our response */ }
      }
    };

    runtime.on("message", handler);
    runtime.sendMessage("peer.message", "nexus", {
      content: queryContent,
      messageType: "chat",
      ...extra,
    });
  });
}

export function createStatusTool(runtime: AgentRuntime, inbox?: MessageInbox) {
  return {
    name: "nexus_status",
    description: "Get current nexus status, connected agents, and active tasks",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    handler: async () => {
      const state = runtime.getState();
      const agentId = runtime.getAgentId();

      if (state !== "connected") {
        return {
          content: [{
            type: "text" as const,
            text: `Not connected to nexus. State: ${state}. Agent ID: ${agentId || "none"}`,
          }],
        };
      }

      const raw = await queryNexus(runtime, "__nexus_query_status");
      try {
        const data = JSON.parse(raw);
        const agents = data.agents || [];
        const status = data.status || {};

        let text = `Nexus Status\n`;
        text += `Version: ${status.version || "0.1.0"}\n`;
        text += `Your Agent ID: ${agentId}\n`;
        text += `Connected: yes\n\n`;
        text += `Tasks: ${status.tasks?.total || 0} total, ${status.tasks?.queued || 0} queued, ${status.tasks?.inProgress || 0} in progress, ${status.tasks?.completed || 0} completed\n`;
        text += `Active debates: ${status.debates?.active || 0}\n`;
        if (inbox) {
          text += `Unread messages: ${inbox.getUnreadCount()}\n`;
        }
        text += `\nConnected Agents (${agents.length}):\n`;
        for (const a of agents) {
          const isMe = a.agentId === agentId ? " (you)" : "";
          text += `  - ${a.name}${isMe} [${a.status}] -- skills: ${a.skills.join(", ")}, tasks: ${a.activeTasks || 0}\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch {
        return { content: [{ type: "text" as const, text: raw }] };
      }
    },
  };
}

export { queryNexus };
