import { describe, expect, it, vi } from "vitest";
import { DxLinkFeed } from "../../../src/client/streaming/feed.js";

/** Minimal mock of DxLinkClient for testing the feed layer. */
function createMockClient() {
  let messageHandler: ((msg: Record<string, unknown>) => void) | null = null;

  return {
    on: vi.fn((event: string, handler: (msg: Record<string, unknown>) => void) => {
      if (event === "message") messageHandler = handler;
    }),
    off: vi.fn(),
    send: vi.fn(),
    openChannel: vi.fn().mockResolvedValue(3),
    closeChannel: vi.fn(),
    waitFor: vi.fn().mockResolvedValue({
      type: "FEED_CONFIG",
      channel: 3,
      dataFormat: "FULL",
      eventFields: {
        Order: [
          "eventFlags",
          "eventSymbol",
          "eventType",
          "index",
          "side",
          "sequence",
          "price",
          "size",
          "time",
        ],
      },
    }),
    /** Simulate a server message. */
    simulateMessage(msg: Record<string, unknown>) {
      messageHandler?.(msg);
    },
  };
}

describe("DxLinkFeed", () => {
  it("opens a channel and sends FEED_SETUP + FEED_SUBSCRIPTION with source for Order", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const callback = vi.fn();
    await feed.subscribe("Order", ["SPY"], callback);

    // Should have sent FEED_SETUP with FULL format for Order
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SETUP",
        channel: 3,
        acceptDataFormat: "FULL",
        acceptAggregationPeriod: 0.25,
      }),
    );

    // Should have sent FEED_SUBSCRIPTION with source: "NTV" and reset: true (first sub)
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SUBSCRIPTION",
        channel: 3,
        reset: true,
        add: [{ type: "Order", symbol: "SPY", source: "NTV" }],
      }),
    );
  });

  it("reuses existing channel for same event type", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    await feed.subscribe("Order", ["SPY"], cb1);
    await feed.subscribe("Order", ["AAPL"], cb2);

    // openChannel should only be called once
    expect(mock.openChannel).toHaveBeenCalledTimes(1);

    // Second subscription should add AAPL with source but NO reset flag
    const secondSub = mock.send.mock.calls.find((c: unknown[]) => {
      const msg = c[0] as Record<string, unknown>;
      return (
        msg.type === "FEED_SUBSCRIPTION" &&
        Array.isArray(msg.add) &&
        (msg.add as Array<Record<string, unknown>>).some((e) => e.symbol === "AAPL")
      );
    });
    expect(secondSub).toBeDefined();
    expect((secondSub?.[0] as Record<string, unknown>).reset).toBeUndefined();
  });

  it("does not re-subscribe already subscribed symbols", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const cb = vi.fn();
    await feed.subscribe("Order", ["SPY"], cb);

    // Reset to track only new calls
    mock.send.mockClear();
    await feed.subscribe("Order", ["SPY"], cb);

    // Should NOT send another FEED_SUBSCRIPTION (SPY already subscribed)
    const subCalls = mock.send.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type === "FEED_SUBSCRIPTION",
    );
    expect(subCalls).toHaveLength(0);
  });

  it("dispatches parsed FULL data to callbacks for Order", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const callback = vi.fn();
    await feed.subscribe("Order", ["SPY"], callback);

    // Simulate FEED_DATA with FULL format (keyed objects)
    mock.simulateMessage({
      type: "FEED_DATA",
      channel: 3,
      data: [
        {
          eventFlags: 0,
          eventSymbol: "SPY",
          eventType: "Order",
          index: 12345,
          side: "BUY",
          sequence: 1,
          price: 500.5,
          size: 200,
          time: 1710000000,
        },
      ],
    });

    expect(callback).toHaveBeenCalledTimes(1);
    const events = callback.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventSymbol: "SPY",
      price: 500.5,
      size: 200,
      side: "BUY",
    });
  });

  it("sends unsubscribe with source for Order symbols", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    await feed.subscribe("Order", ["SPY"], vi.fn());
    feed.unsubscribe("Order", ["SPY"]);

    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SUBSCRIPTION",
        remove: [{ type: "Order", symbol: "SPY", source: "NTV" }],
      }),
    );
  });

  it("ignores non-FEED_DATA messages", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const callback = vi.fn();
    await feed.subscribe("Order", ["SPY"], callback);

    mock.simulateMessage({ type: "KEEPALIVE", channel: 0 });
    expect(callback).not.toHaveBeenCalled();
  });

  it("sends custom fromTime for Candle subscriptions", async () => {
    const mock = createMockClient();
    mock.waitFor = vi.fn().mockResolvedValue({
      type: "FEED_CONFIG",
      channel: 3,
      dataFormat: "FULL",
      eventFields: {
        Candle: [
          "close",
          "eventFlags",
          "eventSymbol",
          "eventType",
          "eventTime",
          "high",
          "impVolatility",
          "low",
          "open",
          "openInterest",
          "time",
          "volume",
          "vwap",
          "sequence",
          "count",
        ],
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);
    const cb = vi.fn();
    await feed.subscribe("Candle", ["NFLX{=5m,tho=false,a=m}"], cb, {
      fromTime: 1740000000000,
    });

    const subCall = mock.send.mock.calls.find((c: unknown[]) => {
      const msg = c[0] as Record<string, unknown>;
      return msg.type === "FEED_SUBSCRIPTION";
    });
    expect(subCall).toBeDefined();
    const addEntries = (subCall?.[0] as Record<string, unknown>).add as Array<
      Record<string, unknown>
    >;
    expect(addEntries[0]).toMatchObject({
      type: "Candle",
      symbol: "NFLX{=5m,tho=false,a=m}",
      fromTime: 1740000000000,
      instrumentType: "equity",
    });
  });

  it("uses default fromTime when opts not provided for Candle", async () => {
    const mock = createMockClient();
    mock.waitFor = vi.fn().mockResolvedValue({
      type: "FEED_CONFIG",
      channel: 3,
      dataFormat: "FULL",
      eventFields: {
        Candle: [
          "close",
          "eventFlags",
          "eventSymbol",
          "eventType",
          "eventTime",
          "high",
          "impVolatility",
          "low",
          "open",
          "openInterest",
          "time",
          "volume",
          "vwap",
          "sequence",
          "count",
        ],
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);
    await feed.subscribe("Candle", ["SPY{=5m,tho=false,a=m}"], vi.fn());

    const subCall = mock.send.mock.calls.find((c: unknown[]) => {
      const msg = c[0] as Record<string, unknown>;
      return msg.type === "FEED_SUBSCRIPTION";
    });
    const addEntries = (subCall?.[0] as Record<string, unknown>).add as Array<
      Record<string, unknown>
    >;
    expect(addEntries[0]?.fromTime).toBe(10000000000);
  });

  it("does not duplicate callbacks on repeated subscribe calls", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const cb = vi.fn();
    await feed.subscribe("Order", ["SPY"], cb);
    await feed.subscribe("Order", ["AAPL"], cb); // same callback, new symbol

    // Simulate one FEED_DATA event
    mock.simulateMessage({
      type: "FEED_DATA",
      channel: 3,
      data: [{ eventSymbol: "SPY", eventType: "Order", price: 500 }],
    });

    // Callback should fire exactly once (not twice from duplicate registration)
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
