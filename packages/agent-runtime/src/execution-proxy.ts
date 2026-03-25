import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import {
  DEFAULT_EXECUTION_ALLOWLIST,
  EXECUTION_DENYLIST,
  EXEC_DEFAULT_TIMEOUT_MS,
} from "@claude-nexus/core";
import type { ExecResult, ExecChunk } from "@claude-nexus/core";
import { sha256 } from "@claude-nexus/core";

export class ExecutionProxy {
  private readonly allowlist: readonly string[];
  private readonly denylist: readonly string[];

  constructor(allowlist?: readonly string[]) {
    this.allowlist = allowlist ?? [...DEFAULT_EXECUTION_ALLOWLIST];
    this.denylist = [...EXECUTION_DENYLIST];
  }

  isAllowed(command: string): boolean {
    const trimmed = command.trim();

    // Check denylist first — any match blocks the command
    for (const denied of this.denylist) {
      if (trimmed.includes(denied)) {
        return false;
      }
    }

    // Check allowlist — the first word must match an allowed command
    const firstWord = trimmed.split(/\s+/)[0];
    if (!firstWord) {
      return false;
    }

    return this.allowlist.some(
      (allowed) =>
        firstWord === allowed ||
        firstWord.endsWith(`/${allowed}`) ||
        firstWord.endsWith(`\\${allowed}`),
    );
  }

  async execute(
    command: string,
    options: {
      readonly workingDirectory?: string;
      readonly env?: Record<string, string>;
      readonly timeoutMs?: number;
    } = {},
  ): Promise<ExecResult> {
    if (!this.isAllowed(command)) {
      return this.buildDeniedResult(command);
    }

    const startTime = Date.now();
    const timeout = options.timeoutMs ?? EXEC_DEFAULT_TIMEOUT_MS;
    const { shell, shellArg } = this.getShellConfig();

    return new Promise<ExecResult>((resolve) => {
      execFile(
        shell,
        [shellArg, command],
        {
          cwd: options.workingDirectory,
          env: { ...process.env, ...options.env },
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const exitCode =
            error?.code != null
              ? typeof error.code === "number"
                ? error.code
                : 1
              : 0;

          resolve({
            requestId: "",
            exitCode,
            stdout: stdout || "",
            stderr: stderr || "",
            durationMs,
            agentId: "",
            platform: platform(),
            outputHash: sha256(stdout || ""),
          });
        },
      );
    });
  }

  executeStreaming(
    command: string,
    options: {
      readonly workingDirectory?: string;
      readonly env?: Record<string, string>;
      readonly timeoutMs?: number;
      readonly onChunk: (chunk: ExecChunk) => void;
    },
  ): Promise<ExecResult> {
    if (!this.isAllowed(command)) {
      return Promise.resolve(this.buildDeniedResult(command));
    }

    const startTime = Date.now();
    const { shell, shellArg } = this.getShellConfig();
    let stdout = "";
    let stderr = "";

    return new Promise<ExecResult>((resolve) => {
      const child = spawn(shell, [shellArg, command], {
        cwd: options.workingDirectory,
        env: { ...process.env, ...options.env },
        timeout: options.timeoutMs ?? EXEC_DEFAULT_TIMEOUT_MS,
      });

      child.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        options.onChunk({
          requestId: "",
          stream: "stdout",
          data: text,
          timestamp: Date.now(),
        });
      });

      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        options.onChunk({
          requestId: "",
          stream: "stderr",
          data: text,
          timestamp: Date.now(),
        });
      });

      child.on("close", (code) => {
        resolve({
          requestId: "",
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          agentId: "",
          platform: platform(),
          outputHash: sha256(stdout),
        });
      });

      child.on("error", (error) => {
        resolve({
          requestId: "",
          exitCode: 1,
          stdout,
          stderr: stderr + "\n" + error.message,
          durationMs: Date.now() - startTime,
          agentId: "",
          platform: platform(),
          outputHash: sha256(stdout),
        });
      });
    });
  }

  private buildDeniedResult(command: string): ExecResult {
    return {
      requestId: "",
      exitCode: 1,
      stdout: "",
      stderr: `Command not allowed: ${command.split(/\s+/)[0]}`,
      durationMs: 0,
      agentId: "",
      platform: platform(),
      outputHash: sha256(""),
    };
  }

  private getShellConfig(): { shell: string; shellArg: string } {
    const isWindows = platform() === "win32";
    return {
      shell: isWindows ? "cmd" : "/bin/sh",
      shellArg: isWindows ? "/c" : "-c",
    };
  }
}
