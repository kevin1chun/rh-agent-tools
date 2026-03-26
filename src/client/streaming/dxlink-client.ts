/** Low-level dxLink WebSocket protocol client. */

import { StreamingConnectionError, StreamingProtocolError } from "./errors.js";

const DXLINK_VERSION = "0.1-DXF-JS/0.5.1";
const DEFAULT_KEEPALIVE_TIMEOUT = 60; // seconds

type MessageHandler = (msg: Record<string, unknown>) => void;
type ErrorHandler = (error: Error) => void;
type CloseHandler = () => void;

export class DxLinkClient {
  private ws: WebSocket | null = null;
  private nextChannel = 1;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastSendTime = 0;

  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private closeHandlers: CloseHandler[] = [];

  /** Pending promises waiting for specific messages. */
  private waiters: Array<{
    test: (msg: Record<string, unknown>) => boolean;
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }> = [];

  private _connected = false;
  get isConnected(): boolean {
    return this._connected;
  }

  on(event: "message", handler: MessageHandler): void;
  on(event: "error", handler: ErrorHandler): void;
  on(event: "close", handler: CloseHandler): void;
  on(
    event: "message" | "error" | "close",
    handler: MessageHandler | ErrorHandler | CloseHandler,
  ): void {
    if (event === "message") this.messageHandlers.push(handler as MessageHandler);
    else if (event === "error") this.errorHandlers.push(handler as ErrorHandler);
    else if (event === "close") this.closeHandlers.push(handler as CloseHandler);
  }

  off(event: "message", handler: MessageHandler): void;
  off(event: "error", handler: ErrorHandler): void;
  off(event: "close", handler: CloseHandler): void;
  off(
    event: "message" | "error" | "close",
    handler: MessageHandler | ErrorHandler | CloseHandler,
  ): void {
    if (event === "message") {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    } else if (event === "error") {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    } else if (event === "close") {
      this.closeHandlers = this.closeHandlers.filter((h) => h !== handler);
    }
  }

  /**
   * Connect to the dxLink WebSocket endpoint and perform handshake.
   * Resolves once AUTH_STATE = AUTHORIZED. Rejects on timeout or auth failure.
   *
   * @param opts.headers — HTTP headers for the WebSocket upgrade request
   *   (e.g. Authorization for Robinhood's gateway).
   */
  async connect(
    wssUrl: string,
    token: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          fn();
        }
      };

      const timer = setTimeout(() => {
        settle(() => {
          this.disconnect();
          reject(new StreamingConnectionError("Connection timed out"));
        });
      }, 15_000);

      const ws = opts?.headers
        ? new WebSocket(wssUrl, { headers: opts.headers } as unknown as string)
        : new WebSocket(wssUrl);
      this.ws = ws;
      ws.onopen = () => {
        // Step 1: Send SETUP
        this.send({
          type: "SETUP",
          channel: 0,
          version: DXLINK_VERSION,
          keepaliveTimeout: DEFAULT_KEEPALIVE_TIMEOUT,
          acceptKeepaliveTimeout: DEFAULT_KEEPALIVE_TIMEOUT,
        });
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }

        this.dispatch(msg);

        // Handshake state machine
        if (msg.type === "SETUP" && msg.channel === 0) {
          // Step 2: Server responded to SETUP, send AUTH
          this.send({ type: "AUTH", channel: 0, token });
        } else if (msg.type === "AUTH_STATE" && msg.channel === 0) {
          if (msg.state === "AUTHORIZED") {
            settle(() => {
              this._connected = true;
              this.startKeepalive();
              resolve();
            });
          }
          // UNAUTHORIZED before AUTHORIZED is expected (initial state);
          // actual auth failure is caught by the 15s connect timeout.
        } else if (msg.type === "ERROR" && msg.channel === 0) {
          settle(() => {
            reject(new StreamingProtocolError(`dxLink error: ${msg.error} — ${msg.message}`));
          });
        }
      };

      ws.onerror = (event) => {
        const err = new StreamingConnectionError(
          `WebSocket error: ${(event as ErrorEvent).message ?? "unknown"}`,
        );
        for (const h of this.errorHandlers) h(err);
        settle(() => reject(err));
      };

      ws.onclose = () => {
        this._connected = false;
        this.stopKeepalive();
        for (const h of this.closeHandlers) h();
        // Reject any pending waiters
        for (const w of this.waiters) {
          w.reject(new StreamingConnectionError("WebSocket closed"));
        }
        this.waiters = [];
        settle(() => reject(new StreamingConnectionError("WebSocket closed during handshake")));
      };
    });
  }

  /** Send a JSON message over the WebSocket. */
  send(msg: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new StreamingConnectionError("WebSocket not connected");
    }
    this.ws.send(JSON.stringify(msg));
    this.lastSendTime = Date.now();
  }

  /** Open a new FEED channel and return the channel ID. */
  async openChannel(service = "FEED"): Promise<number> {
    const channel = this.nextChannel;
    this.nextChannel += 2; // odd-numbered channels

    this.send({
      type: "CHANNEL_REQUEST",
      channel,
      service,
      parameters: { contract: "AUTO" },
    });

    // Wait for CHANNEL_OPENED
    await this.waitFor((msg) => msg.type === "CHANNEL_OPENED" && msg.channel === channel);
    return channel;
  }

  /** Close a channel. */
  closeChannel(channel: number): void {
    this.send({ type: "CHANNEL_CANCEL", channel });
  }

  /** Wait for a message matching a predicate. */
  waitFor(
    test: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 10_000,
  ): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const waiter = { test, resolve, reject };
      this.waiters.push(waiter);

      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new StreamingProtocolError("Timed out waiting for message"));
      }, timeoutMs);

      // Wrap resolve to clear timer
      const origResolve = resolve;
      waiter.resolve = (msg) => {
        clearTimeout(timer);
        origResolve(msg);
      };
    });
  }

  /** Disconnect and clean up. */
  disconnect(): void {
    this.stopKeepalive();
    this._connected = false;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    for (const w of this.waiters) {
      w.reject(new StreamingConnectionError("Disconnected"));
    }
    this.waiters = [];
  }

  /** Reset channel counter (for reconnection). */
  resetChannels(): void {
    this.nextChannel = 1;
  }

  private dispatch(msg: Record<string, unknown>): void {
    // Check waiters first
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w?.test(msg)) {
        this.waiters.splice(i, 1);
        w.resolve(msg);
      }
    }
    // Broadcast to handlers
    for (const h of this.messageHandlers) h(msg);
  }

  private startKeepalive(): void {
    const intervalMs = (DEFAULT_KEEPALIVE_TIMEOUT * 1000) / 2;
    this.keepaliveTimer = setInterval(() => {
      if (Date.now() - this.lastSendTime >= intervalMs) {
        try {
          this.send({ type: "KEEPALIVE", channel: 0 });
        } catch {
          // Connection lost — onclose will handle it
        }
      }
    }, intervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}
