import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "@claude-nexus/nexus-server";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("should register an agent and return a record with ID", () => {
    const record = registry.register({
      name: "alice",
      developerId: "dev-1",
      skills: ["typescript", "react"],
      platform: "darwin",
      maxConcurrentTasks: 2,
    });

    expect(record.agentId).toMatch(/^agent-/);
    expect(record.name).toBe("alice");
    expect(record.skills).toEqual(["typescript", "react"]);
    expect(record.status).toBe("ready");
    expect(registry.size).toBe(1);
  });

  it("should deregister an agent", () => {
    const record = registry.register({
      name: "bob",
      developerId: "dev-2",
      skills: ["python"],
      platform: "linux",
      maxConcurrentTasks: 1,
    });

    const removed = registry.deregister(record.agentId);
    expect(removed).toBeTruthy();
    expect(removed!.name).toBe("bob");
    expect(registry.size).toBe(0);
  });

  it("should find best agent for skills", () => {
    registry.register({
      name: "ts-expert",
      developerId: "dev-1",
      skills: ["typescript", "react", "testing"],
      platform: "darwin",
      maxConcurrentTasks: 2,
    });

    registry.register({
      name: "py-expert",
      developerId: "dev-2",
      skills: ["python", "django", "devops"],
      platform: "linux",
      maxConcurrentTasks: 2,
    });

    const best = registry.findBestForSkills(["python", "django"]);
    expect(best).toBeTruthy();
    expect(best!.name).toBe("py-expert");
  });

  it("should not assign to overloaded agents", () => {
    const record = registry.register({
      name: "busy",
      developerId: "dev-1",
      skills: ["typescript"],
      platform: "darwin",
      maxConcurrentTasks: 1,
    });

    registry.addActiveTask(record.agentId, "task-1");

    const best = registry.findBestForSkills(["typescript"]);
    expect(best).toBeUndefined(); // Agent is at capacity
  });

  it("should track active tasks immutably", () => {
    const record = registry.register({
      name: "worker",
      developerId: "dev-1",
      skills: ["general"],
      platform: "win32",
      maxConcurrentTasks: 3,
    });

    registry.addActiveTask(record.agentId, "task-1");
    registry.addActiveTask(record.agentId, "task-2");

    const agent = registry.get(record.agentId);
    expect(agent!.activeTasks).toEqual(["task-1", "task-2"]);
    expect(agent!.status).toBe("working");

    registry.removeActiveTask(record.agentId, "task-1");
    const updated = registry.get(record.agentId);
    expect(updated!.activeTasks).toEqual(["task-2"]);

    registry.removeActiveTask(record.agentId, "task-2");
    const idle = registry.get(record.agentId);
    expect(idle!.activeTasks).toEqual([]);
    expect(idle!.status).toBe("ready");
  });

  it("should return agent summaries", () => {
    registry.register({
      name: "alice",
      developerId: "dev-1",
      skills: ["ts"],
      platform: "darwin",
      maxConcurrentTasks: 2,
    });

    const summaries = registry.getSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe("alice");
    expect(summaries[0].skills).toEqual(["ts"]);
  });

  it("should handle health checks", () => {
    const record = registry.register({
      name: "test",
      developerId: "dev-1",
      skills: ["general"],
      platform: "linux",
      maxConcurrentTasks: 1,
    });

    // Agent is freshly registered — should be healthy
    const health = registry.checkHealthAll();
    expect(health.healthy).toContain(record.agentId);
    expect(health.unhealthy).toHaveLength(0);
    expect(health.disconnected).toHaveLength(0);
  });
});
