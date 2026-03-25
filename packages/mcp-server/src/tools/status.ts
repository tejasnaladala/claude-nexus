import type { AgentRuntime } from "@claude-nexus/agent-runtime";

export function createStatusTool(runtime: AgentRuntime) {
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
      const activeTasks = runtime.getActiveTasks();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            state,
            agentId,
            activeTasks,
            connected: state === "connected",
          }, null, 2),
        }],
      };
    },
  };
}
