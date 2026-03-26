import { describe, expect, it, vi } from "vitest";
import { Subscription } from "../../../src/client/streaming/subscription.js";
import type { ResolvedSubscribeOptions } from "../../../src/client/streaming/types.js";

/** Minimal DxLinkFeed mock. */
function createMockFeed() {
  return {
    subscribe: vi.fn().mockResolvedValue(1),
    unsubscribe: vi.fn(),
    removeCallback: vi.fn(),
  };
}

function candleOpts(
  overrides?: Partial<ResolvedSubscribeOptions["candles"]>,
): ResolvedSubscribeOptions {
  return {
    candles: { interval: "5m", fromTime: 10000000000, maxCandles: 5000, ...overrides },
    quotes: false,
    trades: undefined,
    orderBook: undefined,
  };
}

describe("Subscription", () => {
  it("subscribes to Candle on the feed when started with candle options", async () => {
    const feed = createMockFeed();
    const dispose = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", candleOpts(), feed as any, dispose);
    await sub.start();

    expect(feed.subscribe).toHaveBeenCalledWith(
      "Candle",
      ["NFLX{=5m,tho=false,a=m}"],
      expect.any(Function),
      { fromTime: 10000000000 },
    );
  });

  it("subscribes to Quote, Trade, TradeETH, Order when all options enabled", async () => {
    const feed = createMockFeed();
    const opts: ResolvedSubscribeOptions = {
      candles: { interval: "5m", fromTime: 10000000000, maxCandles: 5000 },
      quotes: true,
      trades: { maxTrades: 500 },
      orderBook: { maxDepth: 50 },
    };
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", opts, feed as any, vi.fn());
    await sub.start();

    const types = feed.subscribe.mock.calls.map((c: unknown[]) => c[0]);
    expect(types).toContain("Candle");
    expect(types).toContain("Quote");
    expect(types).toContain("Trade");
    expect(types).toContain("TradeETH");
    expect(types).toContain("Order");
  });

  it("buffers candle events and fires callbacks", async () => {
    const feed = createMockFeed();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", candleOpts(), feed as any, vi.fn());
    await sub.start();

    const candleCb = vi.fn();
    sub.on("candle", candleCb);

    // Get the feed callback that was registered
    const feedCb = feed.subscribe.mock.calls[0]?.[2] as (
      events: Array<Record<string, unknown>>,
    ) => void;

    // Simulate backfill candles
    feedCb([
      {
        time: 2000,
        open: 102,
        high: 103,
        low: 101,
        close: 102.5,
        volume: 500,
        count: 20,
        vwap: 102,
        eventTime: 0,
      },
      {
        time: 1000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000,
        count: 50,
        vwap: 100,
        eventTime: 0,
      },
    ]);

    expect(candleCb).toHaveBeenCalledTimes(2);
    expect(sub.getCandles()).toHaveLength(2);
  });

  it("setInterval swaps candle subscription", async () => {
    const feed = createMockFeed();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", candleOpts(), feed as any, vi.fn());
    await sub.start();

    await sub.setInterval("1h");

    // Should subscribe new symbol
    expect(feed.subscribe).toHaveBeenCalledWith(
      "Candle",
      ["NFLX{=1h,tho=false,a=m}"],
      expect.any(Function),
      { fromTime: 10000000000 },
    );
    // Should unsubscribe old symbol
    expect(feed.unsubscribe).toHaveBeenCalledWith("Candle", ["NFLX{=5m,tho=false,a=m}"]);
  });

  it("unsubscribe removes all event types and calls dispose", async () => {
    const feed = createMockFeed();
    const dispose = vi.fn();
    const opts: ResolvedSubscribeOptions = {
      candles: { interval: "5m", fromTime: 10000000000, maxCandles: 5000 },
      quotes: true,
      trades: { maxTrades: 500 },
      orderBook: { maxDepth: 50 },
    };
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", opts, feed as any, dispose);
    await sub.start();

    sub.unsubscribe();

    expect(feed.removeCallback).toHaveBeenCalledTimes(5); // Candle, Quote, Trade, TradeETH, Order
    expect(feed.unsubscribe).toHaveBeenCalledTimes(5);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("trade events buffered via RingBuffer", async () => {
    const feed = createMockFeed();
    const opts: ResolvedSubscribeOptions = {
      candles: undefined,
      quotes: false,
      trades: { maxTrades: 2 },
      orderBook: undefined,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", opts, feed as any, vi.fn());
    await sub.start();

    // Get the Trade feed callback
    const tradeFeedCb = feed.subscribe.mock.calls.find((c: unknown[]) => c[0] === "Trade")?.[2] as (
      events: Array<Record<string, unknown>>,
    ) => void;

    tradeFeedCb([
      {
        eventSymbol: "NFLX",
        eventType: "Trade",
        price: 100,
        size: 10,
        eventTime: 1,
        change: 0,
        dayVolume: 0,
        exchangeCode: "",
        tickDirection: "",
      },
      {
        eventSymbol: "NFLX",
        eventType: "Trade",
        price: 101,
        size: 20,
        eventTime: 2,
        change: 1,
        dayVolume: 0,
        exchangeCode: "",
        tickDirection: "",
      },
      {
        eventSymbol: "NFLX",
        eventType: "Trade",
        price: 102,
        size: 30,
        eventTime: 3,
        change: 1,
        dayVolume: 0,
        exchangeCode: "",
        tickDirection: "",
      },
    ]);

    // maxTrades=2, so oldest evicted
    const trades = sub.getTrades();
    expect(trades).toHaveLength(2);
    expect(trades[0]?.price).toBe(101);
    expect(trades[1]?.price).toBe(102);
  });

  it("quote events store latest only", async () => {
    const feed = createMockFeed();
    const opts: ResolvedSubscribeOptions = {
      candles: undefined,
      quotes: true,
      trades: undefined,
      orderBook: undefined,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const sub = new Subscription("NFLX", opts, feed as any, vi.fn());
    await sub.start();

    const quoteFeedCb = feed.subscribe.mock.calls.find((c: unknown[]) => c[0] === "Quote")?.[2] as (
      events: Array<Record<string, unknown>>,
    ) => void;

    quoteFeedCb([
      {
        eventSymbol: "NFLX",
        eventType: "Quote",
        bidPrice: 100,
        askPrice: 101,
        bidSize: 10,
        askSize: 20,
        bidExchangeCode: "",
        askExchangeCode: "",
        bidTime: 0,
        askTime: 0,
        eventTime: 0,
      },
      {
        eventSymbol: "NFLX",
        eventType: "Quote",
        bidPrice: 102,
        askPrice: 103,
        bidSize: 30,
        askSize: 40,
        bidExchangeCode: "",
        askExchangeCode: "",
        bidTime: 0,
        askTime: 0,
        eventTime: 0,
      },
    ]);

    const quote = sub.getLatestQuote();
    expect(quote?.bidPrice).toBe(102); // latest only
  });
});
