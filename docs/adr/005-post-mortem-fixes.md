# ADR-005: Post-Mortem — Bugs Found During Real-World Multi-Agent Collaboration

## Context

Two developers (Tejas on Windows, Mukund on Mac) used Claude Nexus to coordinate
their Claude Code instances on the AI Agent City project. This document catalogs
every problem discovered and the fixes applied.

## Bugs Discovered

### BUG 1: Temporary Agent Connect/Disconnect Spam
**Severity**: HIGH
**Symptom**: Every time the host checked nexus status, sent a message, or queried
tasks, a new temporary agent registered, did its work, then disconnected. This
flooded the nexus with "Agent X joined" / "Agent X left" notifications, confusing
the other developer.

**Root cause**: No persistent connection pattern. Each operation created a new
WebSocket connection, registered a throwaway agent, and disconnected.

**Fix**: (a) Create a persistent bridge agent that stays connected. (b) Add a
`silent` registration flag so utility agents don't broadcast join/leave messages.

### BUG 2: Messages Dropped — Nobody Listening
**Severity**: CRITICAL
**Symptom**: Friend sent 6 messages that were never received. Messages arrived at
the runtime EventEmitter but were silently dropped.

**Root cause**: MCP tools only listen for messages during active `queryNexus()` calls
(5-second timeout windows). Regular peer messages hit the EventEmitter but no handler
was subscribed outside of query windows.

**Fix**: Added `MessageInbox` class that subscribes to ALL incoming messages and stores
them. Added `nexus_read_inbox` MCP tool. But this is still polling-based.

**Better fix needed**: Push notifications to Claude Code via MCP server-initiated messages.

### BUG 3: Misleading "Tasks Reassigned" Message
**Severity**: LOW
**Symptom**: When a temporary agent disconnected with zero active tasks, the nexus
broadcast "Agent X left. Tasks reassigned." — implying tasks were disrupted.

**Root cause**: Broadcast message didn't check if the agent had any tasks.

**Fix**: Only mention reassignment if agent.activeTasks.length > 0.

### BUG 4: MCP Tools Returned Placeholder Text
**Severity**: HIGH
**Symptom**: `nexus_get_task_queue` returned "Task queue query sent to nexus" instead
of actual task data. `nexus_list_agents` returned "Agent listing requested" with no data.

**Root cause**: MCP tools were fire-and-forget — they sent a request but didn't wait
for the response. No request/response correlation.

**Fix**: Added `queryNexus()` function that sends a special `__nexus_query_*` message
and waits for the response. Server-side handlers return data for these queries.

### BUG 5: Shared Memory Only Reliable Channel
**Severity**: MEDIUM
**Symptom**: Real-time peer messages were unreliable. The only reliable way to
communicate was writing to shared memory keys and polling them.

**Root cause**: Combination of BUG 1 (agents disconnecting) and BUG 2 (messages
dropped). Even when connected, the MCP server's message handling was asynchronous
and not guaranteed to surface messages to Claude Code.

**Fix needed**: Implement proper server-initiated notifications in MCP protocol.

### BUG 6: No Auto-Play on Frontend Connect
**Severity**: LOW
**Symptom**: Frontend connected to WebSocket but showed zero data until play command sent.

**Root cause**: Frontend didn't send `{ command: "play" }` on WebSocket connect.

**Fix**: Added auto-play on connect in useWebSocket.ts.

### BUG 7: Protocol Mismatch Between Backend and Frontend
**Severity**: MEDIUM
**Symptom**: Backend sent agent data inside `tick.agent_deltas[]` but frontend
expected separate `"agents"` type messages.

**Root cause**: No shared protocol spec enforced between Python and TypeScript.

**Fix**: Updated frontend to read `agent_deltas` from tick messages. But the real
fix is a shared protocol definition that both sides import.
