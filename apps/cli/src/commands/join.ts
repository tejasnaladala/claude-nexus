import { AgentRuntime } from "@claude-nexus/agent-runtime";
import { DEFAULT_EXECUTION_ALLOWLIST } from "@claude-nexus/core";

interface JoinOptions {
  name: string;
  skills: string;
  maxTasks: string;
  invite?: string;
}

function decodeInvite(invite: string): string {
  // Invite code is base64url-encoded nexus URL
  try {
    const decoded = Buffer.from(invite, "base64url").toString("utf-8");
    if (decoded.startsWith("ws://") || decoded.startsWith("wss://")) {
      return decoded;
    }
  } catch {
    // Not a valid base64 string — ignore
  }
  throw new Error(
    `Invalid invite code: "${invite}". Ask the host for a valid invite code or use a direct ws:// URL.`,
  );
}

export function encodeInvite(nexusUrl: string): string {
  return Buffer.from(nexusUrl, "utf-8").toString("base64url");
}

export async function joinCommand(
  url: string,
  options: JoinOptions,
): Promise<void> {
  const skills = options.skills.split(",").map((s) => s.trim());
  const maxTasks = parseInt(options.maxTasks, 10) || 2;

  // Resolve invite code to URL if provided
  let resolvedUrl = url;
  if (options.invite) {
    try {
      resolvedUrl = decodeInvite(options.invite);
      console.log(`\n🎟️  Invite resolved to: ${resolvedUrl}`);
    } catch (e) {
      console.error(
        `❌ ${e instanceof Error ? e.message : "Invalid invite code"}`,
      );
      process.exit(1);
    }
  }

  console.log(`\n🔮 Claude Nexus v0.1.0\n`);
  console.log(`Joining nexus at ${resolvedUrl}...`);

  const runtime = new AgentRuntime({
    name: options.name,
    skills,
    nexusUrl: resolvedUrl,
    port: 0,
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
    if (message.type === "debate.initiated") {
      const payload = message.payload as {
        debateId: string;
        config: { topic: string };
      };
      console.log(
        `[Debate] Initiated: ${payload.debateId} — ${payload.config.topic}`,
      );
    }
  });

  runtime.on("error", (error) => {
    console.error(`[Error] ${error.message}`);
  });

  try {
    const registration = await runtime.start(resolvedUrl);
    console.log(`✅ Connected to nexus`);
    console.log(
      `✅ Agent "${options.name}" registered (${registration.agentId})`,
    );
    console.log(`   Skills: ${skills.join(", ")}`);
    console.log(`   Max concurrent tasks: ${maxTasks}\n`);

    const shutdown = async () => {
      console.log("\n🛑 Disconnecting...");
      await runtime.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await new Promise(() => {});
  } catch (error) {
    console.error(
      `❌ Failed to join:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
