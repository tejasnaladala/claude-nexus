import type { AgentRuntime } from "@claude-nexus/agent-runtime";

export function createExecuteRemoteTool(runtime: AgentRuntime) {
  return {
    name: "nexus_execute_remote",
    description: "Remote execution is disabled pending an OS-level sandbox",
    inputSchema: {
      type: "object" as const,
      properties: {
        target_agent: { type: "string", description: "Target agent ID" },
        command: { type: "string", description: "Command to execute" },
        working_directory: {
          type: "string",
          description: "Working directory on target machine",
        },
        timeout_ms: {
          type: "number",
          description: "Execution timeout in milliseconds",
        },
      },
      required: ["target_agent", "command"],
    },
    handler: async (args: {
      target_agent: string;
      command: string;
      working_directory?: string;
      timeout_ms?: number;
    }) => {
      void runtime;
      void args;
      return {
        content: [
          {
            type: "text" as const,
            text: "Remote execution is disabled until commands run in a disposable, no-network OS sandbox.",
          },
        ],
        isError: true,
      };
    },
  };
}
