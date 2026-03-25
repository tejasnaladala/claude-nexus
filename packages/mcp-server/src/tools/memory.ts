import type { AgentRuntime } from "@claude-nexus/agent-runtime";

export function createReadMemoryTool(runtime: AgentRuntime) {
  return {
    name: "nexus_read_memory",
    description: "Read from shared memory",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Memory key to read" },
        scope: { type: "string", enum: ["shared", "task", "agent"], description: "Memory scope" },
      },
      required: ["key"],
    },
    handler: async (args: { key: string; scope?: string }) => {
      runtime.sendMessage("memory.read", "nexus", {
        key: args.key,
        scope: args.scope || "shared",
      });
      return {
        content: [{
          type: "text" as const,
          text: `Memory read request sent for key "${args.key}" in scope "${args.scope || "shared"}".`,
        }],
      };
    },
  };
}

export function createWriteMemoryTool(runtime: AgentRuntime) {
  return {
    name: "nexus_write_memory",
    description: "Write to shared memory for other agents to access",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Value to store" },
        scope: { type: "string", enum: ["shared", "task", "agent"], description: "Memory scope" },
      },
      required: ["key", "value"],
    },
    handler: async (args: { key: string; value: string; scope?: string }) => {
      const sent = runtime.sendMessage("memory.write", "nexus", {
        key: args.key,
        value: args.value,
        scope: args.scope || "shared",
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `Memory written: "${args.key}" = "${args.value.substring(0, 100)}${args.value.length > 100 ? "..." : ""}" in scope "${args.scope || "shared"}".`
            : "Failed to write memory — not connected to nexus.",
        }],
      };
    },
  };
}
