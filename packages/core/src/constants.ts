export const NEXUS_VERSION = "0.1.0" as const;
export const DEFAULT_PORT = 7377;
export const DEFAULT_A2A_PORT = 7378;

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_MISS_THRESHOLD = 3; // 15 seconds
export const HEARTBEAT_DISCONNECT_THRESHOLD = 6; // 30 seconds

export const TASK_STALE_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes
export const TASK_ASSIGNMENT_TIMEOUT_MS = 30 * 1_000; // 30 seconds
export const MAX_TASK_RETRIES = 3;
export const MAX_DECOMPOSITION_DEPTH = 3;

export const DEBATE_MAX_ROUNDS = 3;
export const DEBATE_ROUND_TIMEOUT_MS = 60 * 1_000;
export const DEBATE_CONSENSUS_THRESHOLD = 0.7;
export const DEBATE_AUTO_REVIEW_THRESHOLD = 0.8;

export const RECONNECT_INITIAL_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 30_000;
export const RECONNECT_BACKOFF_MULTIPLIER = 2;
export const RECONNECT_MAX_ATTEMPTS = 20;
export const RECONNECT_JITTER = 0.2;

export const MEMORY_SYNC_INTERVAL_MS = 5_000;
export const MEMORY_MAX_ENTRIES_PER_SCOPE = 10_000;

export const EXEC_DEFAULT_TIMEOUT_MS = 60_000;

export const MESSAGE_ACK_TIMEOUT_MS = 5_000;
export const MESSAGE_MAX_RETRIES = 3;

export const DEFAULT_EXECUTION_ALLOWLIST: readonly string[] = [
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "bun",
  "node",
  "ts-node",
  "tsx",
  "python",
  "python3",
  "pip",
  "go",
  "cargo",
  "rustc",
  "git",
  "cat",
  "ls",
  "find",
  "grep",
  "head",
  "tail",
  "wc",
  "mkdir",
  "cp",
  "mv",
  "echo",
  "printf",
  "curl",
  "wget",
  "docker",
  "docker-compose",
  "make",
  "jest",
  "vitest",
  "pytest",
] as const;

export const EXECUTION_DENYLIST: readonly string[] = [
  "rm -rf /",
  "rm -rf ~",
  "format",
  "fdisk",
  "dd",
  "shutdown",
  "reboot",
  "sudo",
  "su",
  "chmod 777",
] as const;
