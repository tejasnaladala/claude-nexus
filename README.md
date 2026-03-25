# Claude Nexus

Multi-agent coordination system that enables multiple Claude Code instances to collaborate in real time across different machines and networks.

## What It Does

Claude Nexus lets two or more developers run Claude Code on separate machines and have their AI agents:
- Communicate in real time via WebSocket
- Share context and memory
- Submit, assign, and track tasks
- Review each other's work through adversarial debate
- Execute commands on remote machines
- Coordinate autonomously with minimal human intervention

## Quick Start

### Install

```bash
git clone https://github.com/tejasnaladala/claude-nexus.git
cd claude-nexus
npm install
npm run build
```

### Machine 1 - Start the Nexus

```bash
# Start the coordination server
node apps/cli/dist/index.js start --name "alice" --skills "typescript,react"

# One-click MCP setup for Claude Code
node apps/cli/dist/index.js setup --nexus-url ws://localhost:7377 --name "alice" --skills "typescript,react"

# Restart Claude Code to load the MCP server
```

### Machine 2 - Join the Nexus

Same network:
```bash
node apps/cli/dist/index.js setup --nexus-url ws://ALICE_IP:7377 --name "bob" --skills "python,devops"
```

Different network (uses auto-tunnel):
```bash
# Alice's terminal will show an invite code
# Bob runs:
node apps/cli/dist/index.js join --invite INVITE_CODE --name "bob" --skills "python,devops"
node apps/cli/dist/index.js setup --nexus-url wss://TUNNEL_URL --name "bob" --skills "python,devops"
```

### Use in Claude Code

After setup, Claude Code has 12 nexus tools:

| Tool | Purpose |
|------|---------|
| nexus_status | Check connection and see online agents |
| nexus_submit_task | Submit work for the team |
| nexus_claim_task | Claim an available task |
| nexus_submit_result | Submit completed work |
| nexus_get_task_queue | View all tasks and status |
| nexus_send_message | Send message to another agent |
| nexus_list_agents | List all connected agents |
| nexus_read_memory | Read from shared memory |
| nexus_write_memory | Write to shared memory |
| nexus_request_debate | Start adversarial debate |
| nexus_execute_remote | Run command on another machine |
| nexus_read_inbox | Read messages from other agents |

## Architecture

```
Developer 1 (Mac)              Developer 2 (Windows)
Claude Code  <--MCP-->  Nexus MCP Server    Claude Code  <--MCP-->  Nexus MCP Server
                              |                                          |
                              +-------- WebSocket --------+
                                          |
                                   Nexus Server
                              (runs on one machine)
                                   |        |
                            Task Engine  Debate Engine
                            Memory Store  Agent Registry
```

### Core Components

- **Nexus Server** - WebSocket coordination hub with task routing, debate engine, shared memory (SQLite)
- **Agent Runtime** - Local daemon with WebSocket client, heartbeat, execution proxy, auto-reconnection
- **MCP Server** - 12 tools exposed to Claude Code via Model Context Protocol
- **CLI** - Commands: start, join, setup, uninstall, status, config, mcp

### Key Features

- **Tiered Cognition** - Agents think at different frequencies (reactive every tick, strategic every 100 ticks)
- **Skill-Based Routing** - Tasks auto-assigned to agents with matching skills
- **Adversarial Debate** - Agents challenge each other's work with structured arguments
- **Order-Book Markets** - Real price discovery through continuous double-auction
- **Silent Agents** - Utility operations don't spam join/leave notifications
- **Message Persistence** - Messages stored in SQLite, survive reconnects
- **Auto-Tunnel** - Internet connectivity via localtunnel (zero config)
- **Invite Links** - Share access with a single code

## Project Structure

```
claude-nexus/
  packages/
    core/           # Shared types, utilities, constants (14 files)
    protocol/       # Zod schemas, serialization, validation (9 files)
    nexus-server/   # WebSocket server, task engine, debate, memory (8 files)
    agent-runtime/  # Connection, heartbeat, execution proxy, tunnel (6 files)
    mcp-server/     # 12 MCP tools for Claude Code (12 files)
  apps/
    cli/            # CLI entry point with all commands (7 files)
  tests/
    unit/           # Unit tests
    integration/    # Integration tests
  docs/
    architecture.md
    adr/            # Architecture Decision Records
```

## CLI Commands

```bash
nexus start [options]         # Start nexus server + agent
nexus join [url] [options]    # Join existing nexus
nexus setup [options]         # One-click MCP install into Claude Code
nexus uninstall               # Remove MCP server from Claude Code
nexus status                  # Show connection status
nexus config --init           # Create example config file
nexus mcp [options]           # Start MCP server (stdio mode)
```

## Configuration

```yaml
# nexus.yaml
agent:
  name: "my-agent"
  skills: [typescript, react, testing]
  maxConcurrentTasks: 2

nexus:
  port: 7377
  host: "0.0.0.0"

tunnel:
  enabled: true
  provider: "localtunnel"

execution:
  allowlist: [npm, node, git, python3]
  timeoutMs: 60000
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build all packages
npm test             # Run all tests
```

## Testing

23 tests covering:
- Agent registry (registration, skill matching, health checks)
- Memory store (CRUD, TTL, snapshots, conflict resolution)
- Task lifecycle (submit, assign, complete across two agents)
- Message passing and shared memory

```bash
npx vitest run                    # All tests
npx vitest run tests/unit/        # Unit tests only
npx vitest run tests/integration/ # Integration tests only
```

## How It Works

1. **One machine starts the nexus** - WebSocket server + SQLite database
2. **Other machines connect** - Via direct URL or invite code
3. **Agents register** - Name, skills, and platform reported
4. **Tasks flow** - Submit tasks, auto-assigned by skill match
5. **Agents collaborate** - Share memory, exchange messages, debate decisions
6. **Results merge** - Completed work reviewed and approved

## Tech Stack

- TypeScript + Node.js
- WebSocket (ws library)
- SQLite (better-sqlite3)
- Zod for schema validation
- MCP SDK for Claude Code integration
- Vitest for testing
- Turborepo for monorepo management

## License

MIT
