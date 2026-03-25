import { execFile, type ChildProcess } from "node:child_process";

export interface TunnelInfo {
  provider: "bore" | "cloudflared" | "localtunnel";
  localPort: number;
  publicUrl: string;
  process: ChildProcess | null;
}

export class TunnelManager {
  private tunnel: TunnelInfo | null = null;

  async startTunnel(
    localPort: number,
    provider: string = "bore",
  ): Promise<TunnelInfo> {
    switch (provider) {
      case "bore":
        return this.startBore(localPort);
      case "localtunnel":
        return this.startLocaltunnel(localPort);
      default:
        throw new Error(`Unknown tunnel provider: ${provider}`);
    }
  }

  private async startBore(localPort: number): Promise<TunnelInfo> {
    // bore requires a separate binary install — fall back to localtunnel
    // which is available via npx with no install needed
    return this.startLocaltunnel(localPort);
  }

  private async startLocaltunnel(localPort: number): Promise<TunnelInfo> {
    return new Promise<TunnelInfo>((resolve, reject) => {
      const child = execFile(
        "npx",
        ["localtunnel", "--port", String(localPort)],
        { timeout: 30000, shell: true },
      );

      let output = "";
      let resolved = false;

      child.stdout?.on("data", (data: string) => {
        output += data;
        // localtunnel outputs: "your url is: https://xxx.loca.lt"
        const match = output.match(/your url is: (https?:\/\/[^\s]+)/i);
        if (match && !resolved) {
          resolved = true;
          const publicUrl = match[1]
            .replace("https://", "wss://")
            .replace("http://", "ws://");
          this.tunnel = {
            provider: "localtunnel",
            localPort,
            publicUrl,
            process: child,
          };
          resolve(this.tunnel);
        }
      });

      child.stderr?.on("data", (data: string) => {
        output += data;
      });

      child.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      child.on("exit", (code) => {
        if (!resolved) {
          resolved = true;
          reject(
            new Error(`localtunnel exited with code ${code}: ${output}`),
          );
        }
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          reject(
            new Error(
              "Tunnel startup timed out. Try: npx localtunnel --port " +
                localPort,
            ),
          );
        }
      }, 25000);
    });
  }

  async stopTunnel(): Promise<void> {
    if (this.tunnel?.process) {
      this.tunnel.process.kill();
      this.tunnel = null;
    }
  }

  getTunnelInfo(): TunnelInfo | null {
    return this.tunnel;
  }

  isActive(): boolean {
    return this.tunnel !== null && this.tunnel.process !== null;
  }
}
