import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  DEFAULT_EXECUTION_ALLOWLIST,
  type NexusMessage,
} from "@claude-nexus/core";
import { AgentRuntime } from "@claude-nexus/agent-runtime";
import { NexusServer } from "@claude-nexus/nexus-server";

const AUTH_TOKEN = "containment-test-shared-token-32-bytes";
const TEST_TIMEOUT_MS = 3_000;

function message(
  type: NexusMessage["type"],
  from: string,
  payload: Record<string, unknown>,
  to = "nexus",
): NexusMessage {
  return {
    id: `msg-${crypto.randomUUID()}`,
    type,
    from,
    to,
    timestamp: Date.now(),
    payload,
  };
}

function connect(url: string, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function rejectedStatus(url: string, token?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Timed out waiting for handshake rejection"));
    }, TEST_TIMEOUT_MS);

    ws.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      const status = response.statusCode ?? 0;
      response.resume();
      ws.terminate();
      resolve(status);
    });
    ws.once("open", () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error("Unauthenticated WebSocket unexpectedly opened"));
    });
    ws.once("error", () => {
      // ws emits an error after an intentionally rejected upgrade. The
      // unexpected-response handler owns the assertion.
    });
  });
}

function waitForMessage(
  ws: WebSocket,
  predicate: (message: NexusMessage) => boolean,
): Promise<NexusMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, TEST_TIMEOUT_MS);

    const onMessage = (data: WebSocket.RawData): void => {
      const parsed = JSON.parse(data.toString()) as NexusMessage;
      if (!predicate(parsed)) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(parsed);
    };

    ws.on("message", onMessage);
  });
}

function waitForClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Timed out waiting for WebSocket close"));
    }, TEST_TIMEOUT_MS);
    ws.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function register(ws: WebSocket, name: string): Promise<string> {
  const registered = waitForMessage(
    ws,
    (item) => item.type === "agent.registered",
  );
  ws.send(
    JSON.stringify(
      message("agent.register", "unregistered", {
        name,
        developerId: `dev-${name}`,
        skills: ["coordination"],
        platform: "win32",
        maxConcurrentTasks: 1,
      }),
    ),
  );
  const response = await registered;
  return (response.payload as { agentId: string }).agentId;
}

describe("WebSocket containment", () => {
  const servers: NexusServer[] = [];
  const sockets: WebSocket[] = [];

  async function startServer(
    options: { maxPayloadBytes?: number } = {},
  ): Promise<{ server: NexusServer; url: string }> {
    const server = new NexusServer({
      port: 0,
      authToken: AUTH_TOKEN,
      maxPayloadBytes: options.maxPayloadBytes,
    });
    servers.push(server);
    const started = await server.start();
    return { server, url: started.url };
  }

  async function authenticated(url: string): Promise<WebSocket> {
    const ws = await connect(url, AUTH_TOKEN);
    sockets.push(ws);
    return ws;
  }

  afterEach(async () => {
    for (const ws of sockets.splice(0)) {
      if (ws.readyState === WebSocket.OPEN) ws.close(1000);
    }
    for (const server of servers.splice(0)) {
      await server.stop();
    }
  });

  it("fails closed when no shared token is configured", () => {
    const existingToken = process.env.NEXUS_SHARED_TOKEN;
    delete process.env.NEXUS_SHARED_TOKEN;
    try {
      expect(() => new NexusServer({ port: 0 })).toThrow(/shared token/i);
    } finally {
      if (existingToken === undefined) delete process.env.NEXUS_SHARED_TOKEN;
      else process.env.NEXUS_SHARED_TOKEN = existingToken;
    }
  });

  it("binds to loopback and rejects missing or incorrect credentials", async () => {
    const { url } = await startServer();
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:/);
    await expect(rejectedStatus(url)).resolves.toBe(401);
    await expect(
      rejectedStatus(url, "incorrect-token-with-enough-length-32"),
    ).resolves.toBe(401);
  });

  it("blocks memory access before the authenticated socket registers", async () => {
    const { server, url } = await startServer();
    server.memoryStore.write("private-key", "must-not-leak", "shared", "owner");
    const ws = await authenticated(url);
    const error = waitForMessage(ws, (item) => item.type === "nexus.error");
    const closed = waitForClose(ws);

    ws.send(
      JSON.stringify(
        message("memory.read", "attacker", {
          key: "private-key",
          scope: "shared",
        }),
      ),
    );

    await expect(error).resolves.toMatchObject({
      payload: { code: "REGISTRATION_REQUIRED" },
    });
    await expect(closed).resolves.toBe(1008);
  });

  it("binds identity to the socket and rejects sender spoofing", async () => {
    const { url } = await startServer();
    const alice = await authenticated(url);
    const bob = await authenticated(url);
    const aliceId = await register(alice, "alice");
    const bobId = await register(bob, "bob");
    const error = waitForMessage(alice, (item) => item.type === "nexus.error");
    const closed = waitForClose(alice);

    alice.send(
      JSON.stringify(
        message(
          "peer.message",
          bobId,
          {
            content: "forged",
            messageType: "chat",
          },
          bobId,
        ),
      ),
    );

    await expect(error).resolves.toMatchObject({
      payload: { code: "IDENTITY_MISMATCH" },
    });
    await expect(closed).resolves.toBe(1008);
    expect(aliceId).not.toBe(bobId);
  });

  it("rejects payloads outside the strict message schema", async () => {
    const { url } = await startServer();
    const ws = await authenticated(url);
    const agentId = await register(ws, "strict-client");
    const error = waitForMessage(ws, (item) => item.type === "nexus.error");
    const closed = waitForClose(ws);

    ws.send(
      JSON.stringify(
        message(
          "peer.message",
          agentId,
          {
            content: "hello",
            messageType: "chat",
            unexpectedPrivilege: "admin",
          },
          "broadcast",
        ),
      ),
    );

    await expect(error).resolves.toMatchObject({
      payload: { code: "INVALID_MESSAGE" },
    });
    await expect(closed).resolves.toBe(1008);
  });

  it("closes a socket when its bound identity deregisters", async () => {
    const { server, url } = await startServer();
    const ws = await authenticated(url);
    const agentId = await register(ws, "departing-client");
    const closed = waitForClose(ws);

    ws.send(
      JSON.stringify(
        message("agent.deregister", agentId, {
          agentId,
        }),
      ),
    );

    await expect(closed).resolves.toBe(1000);
    expect(server.agentRegistry.get(agentId)).toBeUndefined();
  });

  it("closes connections that exceed the payload limit", async () => {
    const { url } = await startServer({ maxPayloadBytes: 1_024 });
    const ws = await authenticated(url);
    const closed = waitForClose(ws);
    ws.send("x".repeat(2_048));
    await expect(closed).resolves.toBe(1009);
  });

  it("allows authenticated coordination but rejects all execution requests", async () => {
    const { url } = await startServer();
    const alice = await authenticated(url);
    const bob = await authenticated(url);
    const aliceId = await register(alice, "alice-coordinate");
    const bobId = await register(bob, "bob-coordinate");

    const peerMessage = waitForMessage(
      bob,
      (item) =>
        item.type === "peer.message" &&
        (item.payload as { content?: string }).content === "still coordinated",
    );
    alice.send(
      JSON.stringify(
        message(
          "peer.message",
          aliceId,
          {
            content: "still coordinated",
            messageType: "chat",
          },
          bobId,
        ),
      ),
    );
    await expect(peerMessage).resolves.toMatchObject({
      from: aliceId,
      to: bobId,
    });

    const forwarded: NexusMessage[] = [];
    bob.on("message", (data) =>
      forwarded.push(JSON.parse(data.toString()) as NexusMessage),
    );
    const executionError = waitForMessage(
      alice,
      (item) =>
        item.type === "nexus.error" &&
        (item.payload as { code?: string }).code === "EXECUTION_DISABLED",
    );
    alice.send(
      JSON.stringify(
        message("exec.request", aliceId, {
          targetAgentId: bobId,
          command: "whoami",
          timeoutMs: 1_000,
          stream: false,
        }),
      ),
    );

    await expect(executionError).resolves.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(forwarded.some((item) => item.type === "exec.request")).toBe(false);
  });

  it("never executes an execution message delivered by a server", async () => {
    const runtime = new AgentRuntime({
      name: "contained-runtime",
      skills: ["coordination"],
      authToken: AUTH_TOKEN,
      port: 0,
      maxConcurrentTasks: 1,
      executionAllowlist: [...DEFAULT_EXECUTION_ALLOWLIST],
    });
    const execute = vi.spyOn(runtime.getExecutionProxy(), "execute");

    const receive = runtime as unknown as {
      handleMessage(data: string): void;
    };
    receive.handleMessage(
      JSON.stringify(
        message("exec.request", "nexus", {
          targetAgentId: "contained-runtime",
          command: "whoami",
          timeoutMs: 1_000,
          stream: false,
        }),
      ),
    );
    await Promise.resolve();

    expect(execute).not.toHaveBeenCalled();
  });
});
