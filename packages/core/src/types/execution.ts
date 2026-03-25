export interface ExecRequest {
  readonly requestId: string;
  readonly targetAgentId: string;
  readonly command: string;
  readonly workingDirectory?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly stream: boolean;
}

export interface ExecResult {
  readonly requestId: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly agentId: string;
  readonly platform: string;
  readonly outputHash: string;
}

export interface ExecChunk {
  readonly requestId: string;
  readonly stream: "stdout" | "stderr";
  readonly data: string;
  readonly timestamp: number;
}

export interface MachineCapabilities {
  readonly platform: "darwin" | "win32" | "linux";
  readonly arch: "x64" | "arm64";
  readonly runtimes: Readonly<Record<string, string>>;
  readonly tools: readonly string[];
  readonly availableDiskGb: number;
  readonly availableMemoryGb: number;
}
