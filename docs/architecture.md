# Architecture

Claude Nexus is a TypeScript monorepo. One machine runs the nexus server; every
participating machine runs an agent runtime that bridges its local Claude Code
to the nexus over WebSocket.

## Topology

```
Developer 1 (Mac)                          Developer 2 (Windows)
Claude Code <--MCP (stdio)--> MCP Server   Claude Code <--MCP (stdio)--> MCP Server
                                  |                                          |
                            Agent Runtime                             Agent Runtime
                                  |                                          |
                                  +-------------- WebSocket ------------------+
                                                     |
                                               Nexus Server
                                          (runs on one machine)
                                          ┌──────────┴──────────┐
                                    Task Engine          Debate Engine
                                    Memory Store         Agent Registry
                                    Message Router       (SQLite-backed)
```

## Packages

| Package | Responsibility |
|---------|----------------|
| `core` | Shared types, constants, and small utilities (id, hash, similarity, platform detection). No runtime dependencies. |
| `protocol` | Zod schemas for every message type plus serialization and validation. The single source of truth for the wire format. |
| `nexus-server` | The coordination hub: WebSocket server, agent registry, task engine, debate engine, memory store, message router, invite/port helpers. |
| `agent-runtime` | The per-machine daemon: WebSocket client, heartbeat, reconnection, execution proxy, and tunnel manager. |
| `mcp-server` | An MCP server (stdio) that exposes the nexus to Claude Code as a set of tools, with a message inbox so peer messages survive between tool calls. |
| `apps/cli` | The `nexus` command: start, join, setup, uninstall, status, config, mcp. |

## Message flow

1. An agent runtime opens a WebSocket to the nexus and sends `agent.register`
   with its name, skills, and platform. The registry assigns an agent id.
2. The runtime sends heartbeats on an interval. Missed heartbeats move the agent
   to degraded and then disconnected.
3. Task submissions go to the task engine, which sorts by priority and assigns
   to the first online agent whose skills match.
4. Memory writes carry a per-key version. The store keeps the latest version per
   key and merges snapshots by version, so a stale write never clobbers a newer
   one.
5. Peer messages and query responses are routed by the message router. The MCP
   server's inbox subscribes to all incoming messages so Claude Code can read
   them on demand rather than only during an open query window.

## Execution proxy and its limits

`agent-runtime` can run a command on a remote machine on behalf of a peer. The
proxy enforces an allowlist (first token must match) and a denylist, and it
rejects shell metacharacters (`;`, `|`, `&`, backticks, `$()`, redirects,
newlines) so an allowlisted prefix can't chain in a second command. The command
still runs through `sh -c` / `cmd /c`, so treat this as a guardrail for trusted
peers, not a hard sandbox. Anyone who can reach the WebSocket and pass
registration can request execution; run the nexus only among people you trust,
or behind the tunnel's access code.

## Persistence

The nexus server uses SQLite (via `better-sqlite3`) for shared memory and
message history, so memory and messages survive a reconnect. Database files are
gitignored.
