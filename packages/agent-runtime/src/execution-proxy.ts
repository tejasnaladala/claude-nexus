import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import {
  DEFAULT_EXECUTION_ALLOWLIST,
  EXECUTION_DENYLIST,
  EXEC_DEFAULT_TIMEOUT_MS,
} from "@claude-nexus/core";
import type { ExecResult, ExecChunk } from "@claude-nexus/core";
import { sha256 } from "@claude-nexus/core";

// Shell metacharacters that allow command chaining, substitution, or
// redirection. Any of these lets an allowlisted prefix smuggle a second
// command past the allowlist (e.g. "npm; rm -rf /"), so they are rejected
// outright before the command reaches the shell. Backslash is intentionally
// excluded: it is a valid path separator on Windows, and the allowlist match
// already anchors on the first token only.
const SHELL_METACHARACTERS = /[;&|`$()<>\n\r]/;

export class ExecutionProxy {
  private readonly allowlist: readonly string[];
  private readonly denylist: readonly string[];

  constructor(allowlist?: readonly string[]) {
    this.allowlist = allowlist ?? [...DEFAULT_EXECUTION_ALLOWLIST];
    this.denylist = [...EXECUTION_DENYLIST];
  }

  isAllowed(command: string): boolean {
    const trimmed = command.trim();

    // Reject shell metacharacters. The command runs through `sh -c` / `cmd /c`,
    // so allowing `;`, `|`, `&`, backticks, `$(...)`, redirects, or newlines
    // would let a single allowlisted prefix chain in arbitrary commands. The
    // allowlist only vets the first token, so anything that can introduce a
    // second token must be blocked here.
    if (SHELL_METACHARACTERS.test(trimmed)) {
      return false;
    }

    // Check denylist — any match blocks the command.
    for (const denied of this.denylist) {
      if (trimmed.includes(denied)) {
        return false;
      }
    }

    // Check allowlist — the first word must match an allowed command.
    const firstWord = trimmed.split(/\s+/)[0];
    if (!firstWord) {
      return false;
    }

    // Normalize the executable to its basename so an absolute or relative path
    // (e.g. "/usr/local/bin/node" or "C:\\tools\\nodejs\\node.exe") is matched
    // by the bare binary name. Strip a single trailing Windows executable
    // extension (.exe/.cmd/.bat) so "node.exe" matches the "node" allowlist
    // entry. Matching stays exact against the allowlist after normalization, so
    // the security check is not weakened — only the intended binaries pass.
    const basename = firstWord.split(/[/\\]/).pop() ?? firstWord;
    const normalized = basename.replace(/\.(?:exe|cmd|bat)$/i, "");

    return this.allowlist.some((allowed) => normalized === allowed);
  }

  async execute(
    command: string,
    options: {
      readonly requestId?: string;
      readonly agentId?: string;
      readonly workingDirectory?: string;
      readonly env?: Record<string, string>;
      readonly timeoutMs?: number;
    } = {},
  ): Promise<ExecResult> {
    const requestId = options.requestId ?? "";
    const agentId = options.agentId ?? "";

    if (!this.isAllowed(command)) {
      return this.buildDeniedResult(command, requestId, agentId);
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
            requestId,
            exitCode,
            stdout: stdout || "",
            stderr: stderr || "",
            durationMs,
            agentId,
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
      readonly requestId?: string;
      readonly agentId?: string;
      readonly workingDirectory?: string;
      readonly env?: Record<string, string>;
      readonly timeoutMs?: number;
      readonly onChunk: (chunk: ExecChunk) => void;
    },
  ): Promise<ExecResult> {
    const requestId = options.requestId ?? "";
    const agentId = options.agentId ?? "";

    if (!this.isAllowed(command)) {
      return Promise.resolve(
        this.buildDeniedResult(command, requestId, agentId),
      );
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
          requestId,
          stream: "stdout",
          data: text,
          timestamp: Date.now(),
        });
      });

      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        options.onChunk({
          requestId,
          stream: "stderr",
          data: text,
          timestamp: Date.now(),
        });
      });

      child.on("close", (code) => {
        resolve({
          requestId,
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          agentId,
          platform: platform(),
          outputHash: sha256(stdout),
        });
      });

      child.on("error", (error) => {
        resolve({
          requestId,
          exitCode: 1,
          stdout,
          stderr: stderr + "\n" + error.message,
          durationMs: Date.now() - startTime,
          agentId,
          platform: platform(),
          outputHash: sha256(stdout),
        });
      });
    });
  }

  private buildDeniedResult(
    command: string,
    requestId: string,
    agentId: string,
  ): ExecResult {
    return {
      requestId,
      exitCode: 1,
      stdout: "",
      stderr: `Command not allowed: ${command.split(/\s+/)[0]}`,
      durationMs: 0,
      agentId,
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
