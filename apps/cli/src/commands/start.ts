import { NexusServer } from "@claude-nexus/nexus-server";
import { AgentRuntime } from "@claude-nexus/agent-runtime";
import { DEFAULT_PORT, DEFAULT_EXECUTION_ALLOWLIST } from "@claude-nexus/core";

interface StartOptions {
  name: string;
  skills: string;
  port: string;
  host: string;
  maxTasks: string;
  dbPath?: string;
  tunnel: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const port = parseInt(options.port, 10) || DEFAULT_PORT;
  const skills = options.skills.split(",").map((s) => s.trim());
  const maxTasks = parseInt(options.maxTasks, 10) || 2;

  console.log(`\n🔮 Claude Nexus v0.1.0\n`);
  console.log(`Starting nexus server...`);

  // Start the nexus server
  const server = new NexusServer({
    port,
    host: options.host,
    dbPath: options.dbPath,
  });

  try {
    const { url } = await server.start();
    console.log(`✅ Nexus server listening on ${url}`);

    // Start the local agent runtime and connect to self
    const runtime = new AgentRuntime({
      name: options.name,
      skills,
      nexusUrl: `ws://127.0.0.1:${port}`,
      port: port + 1,
      maxConcurrentTasks: maxTasks,
      executionAllowlist: [...DEFAULT_EXECUTION_ALLOWLIST],
    });

    runtime.on("stateChange", (state) => {
      console.log(`[Agent] State: ${state}`);
    });

    runtime.on("message", (message) => {
      if (message.type === "peer.message") {
        const payload = message.payload as { content: string };
        console.log(`[Message] ${payload.content}`);
      }
      if (message.type === "task.assigned") {
        const payload = message.payload as { taskId: string; reason: string };
        console.log(`[Task] Assigned: ${payload.taskId} — ${payload.reason}`);
      }
    });

    const registration = await runtime.start();
    console.log(`✅ Agent "${options.name}" registered (${registration.agentId})`);
    console.log(`   Skills: ${skills.join(", ")}`);
    console.log(`   Max concurrent tasks: ${maxTasks}`);
    console.log(`\n📡 Other agents can join with:`);
    console.log(`   nexus join ws://<your-ip>:${port}\n`);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Shutting down...");
      await runtime.stop();
      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    console.error(
      `❌ Failed to start:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
