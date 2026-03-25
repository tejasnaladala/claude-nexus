import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStore } from "@claude-nexus/nexus-server";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("should write and read a memory entry", () => {
    store.write("test-key", "test-value", "shared", "agent-1");
    const entry = store.read("test-key", "shared");

    expect(entry).toBeTruthy();
    expect(entry!.key).toBe("test-key");
    expect(entry!.value).toBe("test-value");
    expect(entry!.scope).toBe("shared");
    expect(entry!.version).toBe(1);
    expect(entry!.authorAgentId).toBe("agent-1");
  });

  it("should increment version on update", () => {
    store.write("key", "v1", "shared", "agent-1");
    store.write("key", "v2", "shared", "agent-2");

    const entry = store.read("key", "shared");
    expect(entry!.value).toBe("v2");
    expect(entry!.version).toBe(2);
    expect(entry!.authorAgentId).toBe("agent-2");
  });

  it("should delete entries", () => {
    store.write("key", "value", "shared", "agent-1");
    const deleted = store.delete("key", "shared");
    expect(deleted).toBe(true);

    const entry = store.read("key", "shared");
    expect(entry).toBeNull();
  });

  it("should list entries by scope", () => {
    store.write("a", 1, "shared", "agent-1");
    store.write("b", 2, "shared", "agent-1");
    store.write("c", 3, "task", "agent-1");

    const shared = store.list("shared");
    expect(shared).toHaveLength(2);

    const task = store.list("task");
    expect(task).toHaveLength(1);
  });

  it("should list entries with prefix filter", () => {
    store.write("project.name", "Nexus", "shared", "agent-1");
    store.write("project.version", "0.1.0", "shared", "agent-1");
    store.write("other.key", "value", "shared", "agent-1");

    const projectEntries = store.list("shared", "project.");
    expect(projectEntries).toHaveLength(2);
  });

  it("should handle TTL expiration", () => {
    // Write with 1ms TTL (will expire immediately)
    store.write("ephemeral", "data", "shared", "agent-1", 1);

    // Wait for expiry
    const before = store.read("ephemeral", "shared");
    // The read check happens against created_at + ttl, so with 1ms TTL it should be expired almost immediately
    // But we need a small delay to guarantee it
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait 5ms */ }

    const after = store.read("ephemeral", "shared");
    expect(after).toBeNull();
  });

  it("should get snapshot of all entries", () => {
    store.write("a", 1, "shared", "agent-1");
    store.write("b", 2, "task", "agent-1");

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.version).toBeGreaterThan(0);
  });

  it("should get delta snapshot since timestamp", () => {
    store.write("old", "data", "shared", "agent-1");

    const midpoint = Date.now();
    // Small delay to ensure timestamp ordering
    const start = Date.now();
    while (Date.now() - start < 2) { /* busy wait */ }

    store.write("new", "data", "shared", "agent-1");

    const delta = store.getSnapshot(midpoint);
    expect(delta.entries).toHaveLength(1);
    expect(delta.entries[0].key).toBe("new");
  });

  it("should apply snapshot with version conflict resolution", () => {
    store.write("key", "original", "shared", "agent-1");

    const snapshot = {
      entries: [
        {
          key: "key",
          value: "updated",
          scope: "shared" as const,
          version: 5, // Higher version
          authorAgentId: "agent-2",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      timestamp: Date.now(),
      version: 10,
    };

    store.applySnapshot(snapshot);

    const entry = store.read("key", "shared");
    expect(entry!.value).toBe("updated");
    expect(entry!.version).toBe(5);
  });

  it("should save and load tasks", () => {
    const taskData = { taskId: "task-1", title: "Test", status: "queued" };
    store.saveTask("task-1", taskData, "queued");

    const loaded = store.loadTask("task-1");
    expect(loaded).toEqual(taskData);
  });

  it("should store complex JSON values", () => {
    const complexValue = {
      nested: { deep: { value: [1, 2, 3] } },
      array: ["a", "b"],
      number: 42,
      boolean: true,
      null_val: null,
    };

    store.write("complex", complexValue, "shared", "agent-1");
    const entry = store.read("complex", "shared");
    expect(entry!.value).toEqual(complexValue);
  });
});
