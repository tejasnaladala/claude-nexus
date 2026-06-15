# ADR-005: Post-Mortem — Bugs Found While Dogfooding Multi-Agent Collaboration

## Context

Two developers on different machines (one Windows, one macOS) used Claude Nexus
to coordinate their Claude Code instances on a shared project. This document
records the problems that showed up under real use and how each was fixed. The
messaging layer in particular got most of its hardening here, not from synthetic
tests.

## Bugs Discovered

### BUG 1: Temporary Agent Connect/Disconnect Spam
**Severity**: HIGH
**Symptom**: Every status check, message send, or task query spun up a new
temporary agent that registered, did its work, then disconnected. This flooded
the nexus with "Agent X joined" / "Agent X left" notifications.

**Root cause**: No persistent connection pattern. Each operation opened a new
WebSocket connection, registered a throwaway agent, and disconnected.

**Fix**: (a) A persistent bridge agent that stays connected. (b) A `silent`
registration flag so utility agents don't broadcast join/leave messages.

### BUG 2: Messages Dropped — Nobody Listening
**Severity**: CRITICAL
**Symptom**: Six peer messages were never received. They arrived at the runtime
EventEmitter but were silently dropped.

**Root cause**: MCP tools only listened for messages during active `queryNexus()`
calls (5-second timeout windows). Regular peer messages hit the EventEmitter but
no handler was subscribed outside of query windows.

**Fix**: A `MessageInbox` class that subscribes to all incoming messages and
stores them, plus a `nexus_read_inbox` MCP tool. This is polling-based; a
server-initiated push path is the next improvement.

### BUG 3: Misleading "Tasks Reassigned" Message
**Severity**: LOW
**Symptom**: When a temporary agent disconnected with zero active tasks, the
nexus broadcast "Agent X left. Tasks reassigned." — implying tasks were
disrupted.

**Root cause**: The broadcast didn't check whether the agent held any tasks.

**Fix**: Only mention reassignment when `agent.activeTasks.length > 0`.

### BUG 4: MCP Tools Returned Placeholder Text
**Severity**: HIGH
**Symptom**: `nexus_get_task_queue` returned "Task queue query sent to nexus"
instead of real task data. `nexus_list_agents` returned "Agent listing requested"
with no data.

**Root cause**: MCP tools were fire-and-forget — they sent a request but never
waited for the response. No request/response correlation.

**Fix**: A `queryNexus()` function that sends a `__nexus_query_*` message and
waits for the matching response. Server-side handlers return data for these
queries.

### BUG 5: Shared Memory Was the Only Reliable Channel
**Severity**: MEDIUM
**Symptom**: Real-time peer messages were unreliable. The only dependable way to
communicate was writing to shared-memory keys and polling them.

**Root cause**: A combination of BUG 1 (agents disconnecting) and BUG 2
(messages dropped). Even while connected, the MCP server's message handling was
asynchronous and not guaranteed to surface messages to Claude Code.

**Fix**: Addressed by the BUG 1 and BUG 2 fixes. Server-initiated MCP
notifications would close the remaining gap and are tracked as future work.

## Takeaways

- A persistent connection is a prerequisite for reliable messaging. Throwaway
  per-operation connections caused most of the early pain.
- Request/response correlation has to be explicit. Fire-and-forget over a
  WebSocket reads as "working" right up until you need the response.
- Shared memory ended up being the reliability backstop. That is a useful
  property, but it should be a convenience, not the only channel that works.
