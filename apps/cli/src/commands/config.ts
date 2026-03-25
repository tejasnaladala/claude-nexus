import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const EXAMPLE_CONFIG = `# Claude Nexus Configuration
# Place this file at ./nexus.yaml or ~/.config/claude-nexus/config.yaml

agent:
  name: "my-agent"
  skills:
    - typescript
    - react
    - testing
  maxConcurrentTasks: 2

nexus:
  port: 7377
  host: "0.0.0.0"
  mode: "auto"           # "host" | "join" | "auto"
  joinUrl: ""            # Set when mode is "join"

tunnel:
  enabled: true
  provider: "bore"       # "bore" | "cloudflared" | "none"
  boreServer: "bore.pub"

execution:
  allowlist:
    - npm
    - node
    - git
    - python3
  denylist:
    - "rm -rf"
    - sudo
  timeoutMs: 60000

memory:
  dbPath: "./nexus-data/memory.db"
  maxEntriesPerScope: 10000
  syncIntervalMs: 5000

debate:
  maxRounds: 3
  timeoutPerRoundMs: 60000
  consensusThreshold: 0.7
  autoReviewThreshold: 0.8

mcp:
  transport: "stdio"
`;

interface ConfigOptions {
  init?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  if (options.init) {
    const configPath = join(process.cwd(), "nexus.yaml");
    if (existsSync(configPath)) {
      console.log(`⚠️  Config file already exists at ${configPath}`);
      return;
    }
    writeFileSync(configPath, EXAMPLE_CONFIG, "utf-8");
    console.log(`✅ Created example config at ${configPath}`);
    return;
  }

  console.log(`\n🔮 Claude Nexus Configuration\n`);
  console.log(`Use 'nexus config --init' to create an example configuration file.`);
  console.log(`\nConfiguration can be set via:`);
  console.log(`  1. nexus.yaml in current directory`);
  console.log(`  2. ~/.config/claude-nexus/config.yaml`);
  console.log(`  3. Command-line flags`);
  console.log(`  4. Environment variables (NEXUS_PORT, NEXUS_HOST, etc.)\n`);
}
