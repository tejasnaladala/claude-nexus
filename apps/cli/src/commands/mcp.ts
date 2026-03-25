import { AgentRuntime } from "@claude-nexus/agent-runtime";
import { startMcpServer } from "@claude-nexus/mcp-server";
import { DEFAULT_EXECUTION_ALLOWLIST } from "@claude-nexus/core";

interface McpOptions {
  nexusUrl?: string;
  name: string;
  skills: string;
}

export async function mcpCommand(options: McpOptions): Promise<void> {
  const skills = options.skills.split(",").map((s) => s.trim());
  const nexusUrl = options.nexusUrl || process.env.NEXUS_URL;

  // Create agent runtime
  const runtime = new AgentRuntime({
    name: options.name,
    skills,
    nexusUrl,
    port: 0,
    maxConcurrentTasks: 2,
    executionAllowlist: [...DEFAULT_EXECUTION_ALLOWLIST],
  });

  // Connect to nexus if URL provided
  if (nexusUrl) {
    try {
      await runtime.start(nexusUrl);
      // Log to stderr so it doesn't interfere with MCP stdio
      process.stderr.write(
        `[nexus-mcp] Connected to nexus at ${nexusUrl}\n`,
      );
    } catch (error) {
      process.stderr.write(
        `[nexus-mcp] Warning: Could not connect to nexus at ${nexusUrl}: ${error instanceof Error ? error.message : error}\n`,
      );
      process.stderr.write(
        `[nexus-mcp] MCP server will start but some tools may not work without a nexus connection.\n`,
      );
    }
  } else {
    process.stderr.write(
      `[nexus-mcp] No nexus URL provided. Set NEXUS_URL env var or pass --nexus-url.\n`,
    );
    process.stderr.write(
      `[nexus-mcp] Starting MCP server in disconnected mode.\n`,
    );
  }

  // Start MCP server on stdio
  await startMcpServer(runtime);
}
