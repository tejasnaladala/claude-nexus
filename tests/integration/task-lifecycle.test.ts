import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NexusServer } from "@claude-nexus/nexus-server";
import { AgentRuntime } from "@claude-nexus/agent-runtime";
import { DEFAULT_EXECUTION_ALLOWLIST } from "@claude-nexus/core";
import type { NexusMessage } from "@claude-nexus/core";

describe("Task Lifecycle Integration", () => {
  let server: NexusServer;
  let agent1: AgentRuntime;
  let agent2: AgentRuntime;
  let serverPort: number;

  beforeAll(async () => {
    // Start nexus server on random port
    server = new NexusServer({ port: 0, host: "127.0.0.1" });
    const { port } = await server.start();
    serverPort = port;

    const baseConfig = {
      port: 0,
      maxConcurrentTasks: 2,
      executionAllowlist: [...DEFAULT_EXECUTION_ALLOWLIST],
    };

    agent1 = new AgentRuntime({
      ...baseConfig,
      name: "alice",
      skills: ["typescript", "react"],
      nexusUrl: `ws://127.0.0.1:${serverPort}`,
    });

    agent2 = new AgentRuntime({
      ...baseConfig,
      name: "bob",
      skills: ["python", "devops"],
      nexusUrl: `ws://127.0.0.1:${serverPort}`,
    });

    await agent1.start();
    await agent2.start();

    // Wait for both registrations to settle
    await new Promise((r) => setTimeout(r, 500));
  }, 15000);

  afterAll(async () => {
    await agent1?.stop();
    await agent2?.stop();
    await server?.stop();
  });

  it("should register both agents", () => {
    expect(agent1.getAgentId()).toBeTruthy();
    expect(agent2.getAgentId()).toBeTruthy();
    expect(agent1.getState()).toBe("connected");
    expect(agent2.getState()).toBe("connected");
  });

  it("should have two agents in registry", () => {
    expect(server.agentRegistry.size).toBe(2);
  });

  it("should submit a task and auto-assign to matching agent", async () => {
    const messages: NexusMessage[] = [];
    agent2.on("message", (msg: NexusMessage) => {
      messages.push(msg);
    });

    // Agent1 submits a task requiring python skills
    agent1.sendMessage("task.submit", "nexus", {
      title: "Write Python tests",
      description: "Create pytest tests for the auth module",
      priority: "medium",
      skillsRequired: ["python"],
      autoReview: true,
    });

    // Wait for routing
    await new Promise((r) => setTimeout(r, 1000));

    // Check that agent2 (python skills) received the assignment
    const assignment = messages.find((m) => m.type === "task.assigned");
    expect(assignment).toBeDefined();
    expect(server.taskEngine.size).toBeGreaterThan(0);
  });

  it("should send peer messages between agents", async () => {
    const received: NexusMessage[] = [];
    agent2.on("message", (msg: NexusMessage) => {
      if (msg.type === "peer.message") received.push(msg);
    });

    agent1.sendMessage("peer.message", "broadcast", {
      content: "Hello from Alice!",
      messageType: "chat",
    });

    await new Promise((r) => setTimeout(r, 500));

    const chatMsg = received.find(
      (m) =>
        m.type === "peer.message" &&
        (m.payload as any).content === "Hello from Alice!",
    );
    expect(chatMsg).toBeDefined();
  });

  it("should write and read shared memory", async () => {
    agent1.sendMessage("memory.write", "nexus", {
      key: "project-name",
      value: "Claude Nexus",
      scope: "shared",
    });

    await new Promise((r) => setTimeout(r, 300));

    const entry = server.memoryStore.read("project-name", "shared");
    expect(entry).toBeTruthy();
    expect(entry!.value).toBe("Claude Nexus");
  });
});
