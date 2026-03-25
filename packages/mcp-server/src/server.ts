import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import * as tools from "./tools/index.js";
import { MessageInbox } from "./inbox.js";

export function createNexusMcpServer(runtime: AgentRuntime) {
  const server = new Server(
    { name: "claude-nexus", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // Create message inbox to capture incoming messages
  const inbox = new MessageInbox(runtime);

  // Collect all tool definitions
  const allTools = [
    tools.createStatusTool(runtime),
    tools.createSubmitTaskTool(runtime),
    tools.createClaimTaskTool(runtime),
    tools.createSubmitResultTool(runtime),
    tools.createGetTaskQueueTool(runtime),
    tools.createSendMessageTool(runtime),
    tools.createListAgentsTool(runtime),
    tools.createReadMemoryTool(runtime),
    tools.createWriteMemoryTool(runtime),
    tools.createRequestDebateTool(runtime),
    tools.createExecuteRemoteTool(runtime),
    tools.createReadInboxTool(inbox),
  ];

  const toolMap = new Map(allTools.map((t) => [t.name, t]));

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      return await tool.handler(request.params.arguments as any);
    } catch (error) {
      return {
        content: [{ type: "text", text: `Tool error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startMcpServer(runtime: AgentRuntime): Promise<void> {
  const server = createNexusMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
