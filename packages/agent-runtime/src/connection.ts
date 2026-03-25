import WebSocket from "ws";

export interface ConnectionConfig {
  readonly url: string;
  readonly reconnectInitialDelayMs: number;
  readonly reconnectMaxDelayMs: number;
  readonly reconnectBackoffMultiplier: number;
  readonly reconnectMaxAttempts: number;
  readonly reconnectJitter: number;
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export class Connection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: ConnectionConfig;
  private onMessageHandler: ((data: string) => void) | null = null;
  private onStateChangeHandler: ((state: ConnectionState) => void) | null =
    null;
  private onErrorHandler: ((error: Error) => void) | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  onMessage(handler: (data: string) => void): void {
    this.onMessageHandler = handler;
  }

  onStateChange(handler: (state: ConnectionState) => void): void {
    this.onStateChangeHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.onErrorHandler = handler;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState("connecting");
      this.ws = new WebSocket(this.config.url);

      this.ws.on("open", () => {
        this.setState("connected");
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (data) => {
        this.onMessageHandler?.(data.toString());
      });

      this.ws.on("close", (_code, _reason) => {
        if (this.state !== "disconnected") {
          this.attemptReconnect();
        }
      });

      this.ws.on("error", (error) => {
        this.onErrorHandler?.(error);
        if (this.state === "connecting" && this.reconnectAttempts === 0) {
          reject(error);
        }
      });
    });
  }

  send(data: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    this.setState("disconnected");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "Agent disconnecting");
      this.ws = null;
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === "connected";
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnectMaxAttempts) {
      this.setState("disconnected");
      this.onErrorHandler?.(
        new Error("Max reconnection attempts exceeded"),
      );
      return;
    }

    this.setState("reconnecting");
    const delay = this.calculateDelay();
    this.reconnectAttempts++;

    console.log(
      `[Connection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.reconnectMaxAttempts})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // connect() will trigger attemptReconnect via the close/error handlers
      }
    }, delay);
  }

  private calculateDelay(): number {
    const baseDelay = Math.min(
      this.config.reconnectInitialDelayMs *
        Math.pow(
          this.config.reconnectBackoffMultiplier,
          this.reconnectAttempts,
        ),
      this.config.reconnectMaxDelayMs,
    );
    const jitter =
      baseDelay * this.config.reconnectJitter * (Math.random() * 2 - 1);
    return Math.round(baseDelay + jitter);
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.onStateChangeHandler?.(state);
    }
  }
}
