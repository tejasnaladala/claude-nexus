import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface ClaudeJsonProject {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ClaudeJson {
  projects?: Record<string, ClaudeJsonProject>;
  [key: string]: unknown;
}

export async function uninstallCommand(): Promise<void> {
  const claudeJsonPath = join(homedir(), ".claude.json");

  if (!existsSync(claudeJsonPath)) {
    console.log("Could not find ~/.claude.json. Nothing to uninstall.");
    return;
  }

  const data: ClaudeJson = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
  const homeKey = homedir().replace(/\\/g, "/");

  const project = data.projects?.[homeKey];
  if (!project?.mcpServers?.nexus) {
    console.log("No nexus MCP server found in ~/.claude.json. Nothing to uninstall.");
    return;
  }

  delete project.mcpServers.nexus;
  writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2));

  console.log("\nClaude Nexus -- MCP Uninstalled\n");
  console.log("Removed 'nexus' MCP server from ~/.claude.json");
  console.log("Restart Claude Code to apply the change.\n");
}
