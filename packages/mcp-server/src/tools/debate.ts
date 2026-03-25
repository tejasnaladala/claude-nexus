import type { AgentRuntime } from "@claude-nexus/agent-runtime";

export function createRequestDebateTool(runtime: AgentRuntime) {
  return {
    name: "nexus_request_debate",
    description: "Request adversarial debate on a decision or result",
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: { type: "string", description: "What to debate" },
        context: { type: "string", description: "Background information" },
        options: { type: "array", items: { type: "string" }, description: "Options to evaluate" },
      },
      required: ["topic"],
    },
    handler: async (args: { topic: string; context?: string; options?: string[] }) => {
      const sent = runtime.sendMessage("debate.initiate", "nexus", {
        topic: args.topic,
        context: args.context || "",
        triggerType: "manual",
        maxRounds: 3,
        timeoutPerRoundMs: 60000,
        consensusThreshold: 0.7,
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `Debate initiated on topic: "${args.topic}". All connected agents will be invited to participate.`
            : "Failed to initiate debate — not connected to nexus.",
        }],
      };
    },
  };
}
