import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface SetupOptions {
  nexusUrl?: string;
  name: string;
  skills: string;
}

interface ClaudeJsonProject {
  allowedTools?: string[];
  mcpContextUris?: string[];
  mcpServers?: Record<string, unknown>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

interface ClaudeJson {
  projects?: Record<string, ClaudeJsonProject>;
  [key: string]: unknown;
}

export async function setupCommand(options: SetupOptions): Promise<void> {
  const claudeJsonPath = join(homedir(), ".claude.json");

  if (!existsSync(claudeJsonPath)) {
    console.log("Could not find ~/.claude.json. Is Claude Code installed?");
    process.exit(1);
  }

  const data: ClaudeJson = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
  const homeKey = homedir().replace(/\\/g, "/");

  // Ensure project entry exists
  if (!data.projects) data.projects = {};
  if (!data.projects[homeKey]) {
    data.projects[homeKey] = {
      allowedTools: [],
      mcpContextUris: [],
      mcpServers: {},
      enabledMcpjsonServers: [],
      disabledMcpjsonServers: [],
    };
  }
  if (!data.projects[homeKey].mcpServers) {
    data.projects[homeKey].mcpServers = {};
  }

  // Find the nexus CLI path
  const nexusCliPath = join(process.cwd(), "apps", "cli", "dist", "index.js").replace(/\\/g, "/");

  // Build args
  const args = [nexusCliPath, "mcp"];
  if (options.nexusUrl) {
    args.push("--nexus-url", options.nexusUrl);
  }
  args.push("--name", options.name);
  args.push("--skills", options.skills);

  // Add or update MCP server entry
  data.projects[homeKey].mcpServers!.nexus = {
    type: "stdio",
    command: "node",
    args,
  };

  writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2));

  console.log("\nClaude Nexus -- MCP Setup Complete!\n");
  console.log("Added 'nexus' MCP server to ~/.claude.json");
  console.log(`   Agent name: ${options.name}`);
  console.log(`   Skills: ${options.skills}`);
  if (options.nexusUrl) {
    console.log(`   Nexus URL: ${options.nexusUrl}`);
  } else {
    console.log("   Nexus URL: not set (set NEXUS_URL env var or pass --nexus-url)");
  }
  console.log("\nNext steps:");
  console.log("   1. Restart Claude Code to load the MCP server");
  console.log("   2. In Claude Code, say: 'Use nexus_status to check connection'");
  console.log("   3. Your Claude Code now has 12 nexus tools available!\n");
}
