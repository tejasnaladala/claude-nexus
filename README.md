# Claude Nexus

A coordination layer that lets multiple Claude Code instances, on different
machines and different networks, work on the same project together.

## Why it exists

I was pair-programming with another developer, both of us driving Claude Code,
and we kept hitting the same wall: our agents had no way to talk to each other.
We were copy-pasting context between two terminals by hand. Claude Nexus is the
thing that fixes that. One person starts a nexus, the other joins with an invite
code, and from then on both agents share a task queue, a memory store, and a
message channel. The server is loopback-only by default; LAN or tunnel access
must be enabled explicitly and every peer must present the shared token.

It is real, dogfooded code: two people used it to coordinate Claude Code on a
shared project, and the bugs that surfaced during that run are written up in
[`docs/adr/005-post-mortem-fixes.md`](docs/adr/005-post-mortem-fixes.md). About
5.9K lines of TypeScript across six packages, 41 tests.

## Quick start

```bash
git clone https://github.com/tejasnaladala/claude-nexus.git
cd claude-nexus
npm install
npm run build
```

### Machine 1 — start the nexus

```bash
# Generate a high-entropy value once, then give it to peers through a
# separate secure channel. Never put it in an invite URL or commit it.
export NEXUS_SHARED_TOKEN="<at-least-32-byte-random-token>"

# Start the coordination server and register as an agent
node apps/cli/dist/index.js start --name "alice" --skills "typescript,react"

# Wire the nexus into Claude Code as an MCP server
node apps/cli/dist/index.js setup --nexus-url ws://localhost:7377 --name "alice" --skills "typescript,react"

# Restart Claude Code so it loads the MCP server
```

### Machine 2 — join

Same network:

```bash
export NEXUS_SHARED_TOKEN="<token-received-from-alice>"

# Alice must opt into LAN binding with: --host 0.0.0.0
node apps/cli/dist/index.js join ws://ALICE_IP:7377 --name "bob" --skills "python,devops"
node apps/cli/dist/index.js setup --nexus-url ws://ALICE_IP:7377 --name "bob" --skills "python,devops"
```

Different network (Alice explicitly starts with `--tunnel`; the token is still
shared separately from the invite code):

```bash
node apps/cli/dist/index.js join --invite INVITE_CODE --name "bob" --skills "python,devops"
node apps/cli/dist/index.js setup --nexus-url wss://TUNNEL_URL --name "bob" --skills "python,devops"
```

### Use it from Claude Code

After `setup` and a restart, Claude Code has 11 nexus tools:

| Tool                   | Purpose                                |
| ---------------------- | -------------------------------------- |
| `nexus_status`         | Check connection and see online agents |
| `nexus_submit_task`    | Submit work for the team               |
| `nexus_claim_task`     | Claim an available task                |
| `nexus_submit_result`  | Submit completed work                  |
| `nexus_get_task_queue` | View all tasks and status              |
| `nexus_send_message`   | Send a message to another agent        |
| `nexus_list_agents`    | List connected agents                  |
| `nexus_read_memory`    | Read from shared memory                |
| `nexus_write_memory`   | Write to shared memory                 |
| `nexus_request_debate` | Start an adversarial review            |
| `nexus_read_inbox`     | Read messages from other agents        |

## How it works

1. One machine starts the nexus: a WebSocket server backed by SQLite.
2. Other machines connect by direct URL or invite code.
3. Each agent registers with a name, skills, and platform.
4. Tasks get submitted and auto-assigned to an online agent whose skills match.
5. Agents share memory, send messages, and request reviews of each other's work.

The full topology and per-package breakdown is in
[`docs/architecture.md`](docs/architecture.md).

```
Claude Code <--MCP--> MCP Server <--+
                                    |
                              Agent Runtime
                                    |
                              WebSocket
                                    |
                              Nexus Server  (runs on one machine)
                              ┌─────┴─────┐
                        Task Engine   Debate Engine
                        Memory Store  Agent Registry
```

### Components

- **Nexus server** — the WebSocket hub. Holds the agent registry, task engine,
  debate engine, message router, and a SQLite-backed shared memory store.
- **Agent runtime** — the per-machine daemon: authenticated WebSocket client,
  heartbeat, reconnection with backoff, and tunnel manager.
- **MCP server** — exposes the nexus to Claude Code as 11 tools, with an inbox
  so peer messages survive between tool calls.
- **CLI** — `start`, `join`, `setup`, `uninstall`, `status`, `config`, `mcp`.

### What the design actually does (and doesn't)

A few things are easy to oversell, so to be precise:

- **Shared memory** is a versioned, snapshot-merged store. Each key carries a
  monotonic version; a snapshot merge only upserts a key when its version is
  newer than the local copy. That is last-writer-by-version, not vector-clock
  causal ordering.
- **Task routing** is a priority-sorted queue (critical / high / medium / low)
  with skill-based auto-assignment, explicit `claim()`, and stale-task
  detection. It is pull-claim plus push-assign, not a classic work-stealing
  scheduler.
- **Remote execution is disabled.** The coordinator rejects execution requests
  and results, the agent runtime drops execution messages, and the MCP surface
  does not advertise an execution tool. It must remain disabled until commands
  run in a disposable, unprivileged, no-network OS sandbox with no host secrets
  or writable host mounts and strict resource limits.

### Other features

- **Skill-based routing** — tasks land on agents whose declared skills match.
- **Adversarial review** — agents can challenge each other's work with
  structured arguments before a result is accepted.
- **Silent agents** — utility connections don't spam join/leave notifications.
- **Message persistence** — messages are stored in SQLite and survive
  reconnects.
- **Explicit tunnel mode** — internet connectivity is opt-in with `--tunnel`.
- **Invite links** — share the endpoint only; authentication tokens travel
  through a separate secure channel.

## Project structure

```
claude-nexus/
  packages/
    core/           # Shared types, utilities, constants
    protocol/       # Zod schemas, serialization, validation
    nexus-server/   # WebSocket server, task engine, debate, memory
    agent-runtime/  # Authenticated connection, heartbeat, tunnel
    mcp-server/     # 11 MCP tools for Claude Code
  apps/
    cli/            # CLI entry point with all commands
  tests/
    unit/           # Unit tests
    integration/    # Integration tests
  docs/
    architecture.md
    adr/            # Architecture Decision Records
```

## CLI commands

```bash
nexus start [options]         # Start nexus server + agent
nexus join [url] [options]    # Join an existing nexus
nexus setup [options]         # Install the MCP server into Claude Code
nexus uninstall               # Remove the MCP server from Claude Code
nexus status                  # Show connection status
nexus config --init           # Create an example config file
nexus mcp [options]           # Start the MCP server (stdio mode)
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
  host: "127.0.0.1"
  sharedTokenEnv: "NEXUS_SHARED_TOKEN"
  maxPayloadBytes: 65536

tunnel:
  enabled: false
  provider: "localtunnel"

execution:
  enabled: false
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build all packages
npm test             # Run all tests
```

### Tests

41 tests cover the agent registry (registration, skill matching, health checks),
the memory store (CRUD, TTL, snapshots, version-based conflict resolution), the
task lifecycle (submit, assign, complete across two agents), and the execution
proxy's local allowlist. Adversarial integration tests cover authentication,
pre-registration access, identity spoofing, strict schemas, payload limits, and
the remote-execution kill switch.

```bash
npx vitest run                    # All tests
npx vitest run tests/unit/        # Unit tests only
npx vitest run tests/integration/ # Integration tests only
```

## Tech stack

- TypeScript + Node.js (20+)
- WebSocket (`ws`)
- SQLite (`better-sqlite3`)
- Zod for schema validation
- MCP SDK for the Claude Code integration
- Vitest for tests
- Turborepo + npm workspaces for the monorepo

## License

MIT — see [LICENSE](LICENSE).
