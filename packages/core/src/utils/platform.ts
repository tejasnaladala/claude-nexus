import { platform, arch, freemem, totalmem } from "node:os";
import { execFileSync } from "node:child_process";

export function detectPlatform(): "darwin" | "win32" | "linux" {
  return platform() as "darwin" | "win32" | "linux";
}

export function detectArch(): "x64" | "arm64" {
  return arch() as "x64" | "arm64";
}

export function getAvailableMemoryGb(): number {
  return Math.round((freemem() / 1024 / 1024 / 1024) * 100) / 100;
}

export function getTotalMemoryGb(): number {
  return Math.round((totalmem() / 1024 / 1024 / 1024) * 100) / 100;
}

export function detectRuntime(name: string): string | undefined {
  try {
    const version = execFileSync(name, ["--version"], {
      encoding: "utf-8",
      timeout: 5_000,
    }).trim();
    return version;
  } catch {
    return undefined;
  }
}

export function detectInstalledTools(): string[] {
  const tools = [
    "git",
    "node",
    "npm",
    "python3",
    "python",
    "go",
    "cargo",
    "docker",
    "make",
    "curl",
  ];

  const locateCmd = platform() === "win32" ? "where" : "which";

  return tools.filter((tool) => {
    try {
      execFileSync(locateCmd, [tool], {
        encoding: "utf-8",
        timeout: 3_000,
      });
      return true;
    } catch {
      return false;
    }
  });
}
