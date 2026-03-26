import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DxLinkClient } from "../../../src/client/streaming/dxlink-client.js";

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  sent: string[] = [];

  constructor(_url: string) {
    // Auto-trigger onopen after microtask
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string) {
    this.sent.push(data);
    const msg = JSON.parse(data);

    // Simulate server responses
    if (msg.type === "SETUP") {
      queueMicrotask(() => {
        this.onmessage?.({
          data: JSON.stringify({
            type: "SETUP",
            channel: 0,
            version: "0.1-js/1.0.0",
            keepaliveTimeout: 60,
            acceptKeepaliveTimeout: 60,
          }),
        });
      });
    } else if (msg.type === "AUTH") {
      queueMicrotask(() => {
        this.onmessage?.({
          data: JSON.stringify({ type: "AUTH_STATE", channel: 0, state: "UNAUTHORIZED" }),
        });
        this.onmessage?.({
          data: JSON.stringify({ type: "AUTH_STATE", channel: 0, state: "AUTHORIZED" }),
        });
      });
    } else if (msg.type === "CHANNEL_REQUEST") {
      queueMicrotask(() => {
        this.onmessage?.({
          data: JSON.stringify({
            type: "CHANNEL_OPENED",
            channel: msg.channel,
            service: msg.service,
          }),
        });
      });
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

describe("DxLinkClient", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("completes handshake: SETUP → AUTH → AUTHORIZED", async () => {
    const client = new DxLinkClient();
    await client.connect("wss://test.example.com", "test-token");

    expect(client.isConnected).toBe(true);
    client.disconnect();
  });

  it("opens channels with odd-numbered IDs", async () => {
    const client = new DxLinkClient();
    await client.connect("wss://test.example.com", "test-token");

    const ch1 = await client.openChannel("FEED");
    const ch2 = await client.openChannel("FEED");

    expect(ch1).toBe(1);
    expect(ch2).toBe(3);
    client.disconnect();
  });

  it("dispatches messages to handlers", async () => {
    const client = new DxLinkClient();
    const messages: Record<string, unknown>[] = [];
    client.on("message", (msg) => messages.push(msg));

    await client.connect("wss://test.example.com", "test-token");

    // Messages from handshake should have been dispatched
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.type === "AUTH_STATE")).toBe(true);
    client.disconnect();
  });

  it("disconnect cleans up", async () => {
    const client = new DxLinkClient();
    await client.connect("wss://test.example.com", "test-token");
    expect(client.isConnected).toBe(true);

    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  it("waitFor resolves on matching message", async () => {
    const client = new DxLinkClient();
    await client.connect("wss://test.example.com", "test-token");

    // openChannel uses waitFor internally — if it resolves, waitFor works
    const channel = await client.openChannel("FEED");
    expect(channel).toBe(1);
    client.disconnect();
  });

  it("send throws when not connected", () => {
    const client = new DxLinkClient();
    expect(() => client.send({ type: "KEEPALIVE", channel: 0 })).toThrow("not connected");
  });
});
