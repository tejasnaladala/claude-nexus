#!/usr/bin/env node

import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { joinCommand } from "./commands/join.js";
import { statusCommand } from "./commands/status.js";
import { mcpCommand } from "./commands/mcp.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("nexus")
  .description("Claude Nexus — Multi-agent coordination system for Claude Code")
  .version("0.1.0");

program
  .command("start")
  .description("Start a nexus agent (becomes nexus host if first)")
  .option("-n, --name <name>", "Agent name", "agent")
  .option("-s, --skills <skills>", "Comma-separated skills", "general")
  .option("-p, --port <port>", "Nexus server port", "7377")
  .option("--host <host>", "Bind host", "0.0.0.0")
  .option("--max-tasks <n>", "Max concurrent tasks", "2")
  .option("--db-path <path>", "SQLite database path")
  .option("--no-tunnel", "Disable automatic tunnel")
  .action(startCommand);

program
  .command("join <url>")
  .description("Join an existing nexus")
  .option("-n, --name <name>", "Agent name", "agent")
  .option("-s, --skills <skills>", "Comma-separated skills", "general")
  .option("--max-tasks <n>", "Max concurrent tasks", "2")
  .action(joinCommand);

program
  .command("status")
  .description("Show current nexus status")
  .action(statusCommand);

program
  .command("mcp")
  .description("Start MCP server (stdio mode for Claude Code)")
  .option("-u, --nexus-url <url>", "Nexus URL to connect to")
  .option("-n, --name <name>", "Agent name", "claude-code-agent")
  .option("-s, --skills <skills>", "Comma-separated skills", "general")
  .action(mcpCommand);

program
  .command("config")
  .description("Manage configuration")
  .option("--init", "Create example config file")
  .action(configCommand);

program.parse();
