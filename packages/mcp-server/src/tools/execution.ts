import type { AgentRuntime } from "@claude-nexus/agent-runtime";

export function createExecuteRemoteTool(runtime: AgentRuntime) {
  return {
    name: "nexus_execute_remote",
    description: "Request code execution on another agent's machine",
    inputSchema: {
      type: "object" as const,
      properties: {
        target_agent: { type: "string", description: "Target agent ID" },
        command: { type: "string", description: "Command to execute" },
        working_directory: { type: "string", description: "Working directory on target machine" },
        timeout_ms: { type: "number", description: "Execution timeout in milliseconds" },
      },
      required: ["target_agent", "command"],
    },
    handler: async (args: { target_agent: string; command: string; working_directory?: string; timeout_ms?: number }) => {
      const sent = runtime.sendMessage("exec.request", "nexus", {
        targetAgentId: args.target_agent,
        command: args.command,
        workingDirectory: args.working_directory,
        timeoutMs: args.timeout_ms || 60000,
        stream: false,
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `Execution request sent to agent ${args.target_agent}: "${args.command}". Results will be returned when complete.`
            : "Failed to send execution request — not connected to nexus.",
        }],
      };
    },
  };
}
