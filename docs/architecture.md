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

| Package         | Responsibility                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core`          | Shared types, constants, and small utilities (id, hash, similarity, platform detection). No runtime dependencies.                                |
| `protocol`      | Zod schemas for every message type plus serialization and validation. The single source of truth for the wire format.                            |
| `nexus-server`  | The coordination hub: WebSocket server, agent registry, task engine, debate engine, memory store, message router, invite/port helpers.           |
| `agent-runtime` | The per-machine daemon: authenticated WebSocket client, heartbeat, reconnection, and tunnel manager.                                             |
| `mcp-server`    | An MCP server (stdio) that exposes the nexus to Claude Code as a set of tools, with a message inbox so peer messages survive between tool calls. |
| `apps/cli`      | The `nexus` command: start, join, setup, uninstall, status, config, mcp.                                                                         |

## Message flow

1. An agent runtime opens a WebSocket with a bearer token. The server rejects
   unauthenticated upgrades before any application data is available.
2. The authenticated socket sends `agent.register` with its name, skills, and
   platform. The registry assigns an agent id and binds it to that socket.
3. The runtime sends heartbeats on an interval. Missed heartbeats move the agent
   to degraded and then disconnected.
4. Task submissions go to the task engine, which sorts by priority and assigns
   to the first online agent whose skills match.
5. Memory writes carry a per-key version. The store keeps the latest version per
   key and merges snapshots by version, so a stale write never clobbers a newer
   one.
6. Peer messages and query responses are routed by the message router. The MCP
   server's inbox subscribes to all incoming messages so Claude Code can read
   them on demand rather than only during an open query window.

## Security boundary

The server binds to `127.0.0.1` by default and requires a shared bearer token of
at least 32 bytes. Authentication happens during the WebSocket upgrade. After
registration, every message identity must match the server-side socket binding;
the server accepts only a closed set of strict Zod schemas and limits frames to
64 KiB by default.

Remote command execution is disabled at the coordinator, agent runtime, and MCP
tool surface. The existing local execution helper is not a security sandbox and
must not be reconnected to remote messages. Re-enabling the feature requires a
disposable, unprivileged, no-network OS sandbox with no host secrets or writable
host mounts, plus CPU, memory, process, syscall, and wall-time limits.

The shared token authenticates membership; it does not provide per-agent
authorization or confidentiality. Use TLS for any deliberate non-loopback
deployment and rotate the token when a member or endpoint is no longer trusted.

## Persistence

The nexus server uses SQLite (via `better-sqlite3`) for shared memory and
message history, so memory and messages survive a reconnect. Database files are
gitignored.
