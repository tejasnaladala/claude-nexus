import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import * as tools from "./tools/index.js";
import { MessageInbox } from "./inbox.js";
import { getNotificationBanner, COLLABORATION_PROMPT } from "./notifications.js";

export function createNexusMcpServer(runtime: AgentRuntime) {
  const server = new Server(
    { name: "claude-nexus", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // Create message inbox to capture incoming messages
  const inbox = new MessageInbox(runtime);

  // Collect all tool definitions
  const allTools = [
    tools.createStatusTool(runtime, inbox),
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
    tools.createReadInboxTool(inbox, runtime),
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

  // Call tool handler — appends notification banner to every response
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(request.params.arguments as any);

      // Append unread message notification to every tool response
      // (except nexus_read_inbox itself to avoid recursion)
      if (request.params.name !== "nexus_read_inbox") {
        const banner = getNotificationBanner(inbox);
        if (banner && result.content && Array.isArray(result.content)) {
          const lastItem = result.content[result.content.length - 1];
          if (lastItem && lastItem.type === "text") {
            lastItem.text += banner;
          }
        }
      }

      return result;
    } catch (error) {
      return {
        content: [{ type: "text", text: `Tool error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // MCP Resources — collaboration prompt injected into Claude Code context
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "nexus://collaboration-guide",
        name: "Claude Nexus Collaboration Guide",
        description: "Instructions for autonomous multi-agent collaboration",
        mimeType: "text/plain",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "nexus://collaboration-guide") {
      return {
        contents: [
          {
            uri: "nexus://collaboration-guide",
            mimeType: "text/plain",
            text: COLLABORATION_PROMPT,
          },
        ],
      };
    }
    return { contents: [] };
  });

  return { server, inbox };
}

export async function startMcpServer(runtime: AgentRuntime): Promise<void> {
  const { server } = createNexusMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
