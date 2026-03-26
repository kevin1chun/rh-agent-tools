/** Per-symbol subscription — owns buffers, routes events, manages lifecycle. */

import { CandleBuffer } from "./candle-buffer.js";
import { OrderBook, type OrderBookSnapshot } from "./order-book.js";
import { RingBuffer } from "./ring-buffer.js";
import type { CandleEvent, QuoteEvent, ResolvedSubscribeOptions, TradeEvent } from "./types.js";

type EventCallback = (events: Array<Record<string, unknown>>) => void;

interface Feed {
  subscribe(
    eventType: string,
    symbols: string[],
    callback: EventCallback,
    opts?: { fromTime?: number },
  ): Promise<number>;
  unsubscribe(eventType: string, symbols: string[]): void;
  removeCallback(eventType: string, callback: EventCallback): void;
}

type CandleListener = (candle: CandleEvent) => void;
type TradeListener = (trade: TradeEvent) => void;
type QuoteListener = (quote: QuoteEvent) => void;

export class Subscription {
  readonly symbol: string;

  private candleBuffer: CandleBuffer | null = null;
  private tradeBuffer: RingBuffer<TradeEvent> | null = null;
  private latestQuote: QuoteEvent | null = null;
  private book: OrderBook | null = null;

  private candleListeners: CandleListener[] = [];
  private tradeListeners: TradeListener[] = [];
  private quoteListeners: QuoteListener[] = [];

  private opts: ResolvedSubscribeOptions;
  private feed: Feed;
  private onDispose: () => void;
  private candleInterval: string | null = null;

  // Bound callbacks for feed registration (stable references for removeCallback)
  private feedCandleCb: EventCallback = (evts) => this.handleCandleEvents(evts);
  private feedTradeCb: EventCallback = (evts) => this.handleTradeEvents(evts);
  private feedQuoteCb: EventCallback = (evts) => this.handleQuoteEvents(evts);
  private feedOrderCb: EventCallback = (evts) => this.handleOrderEvents(evts);

  constructor(symbol: string, opts: ResolvedSubscribeOptions, feed: Feed, onDispose: () => void) {
    this.symbol = symbol;
    this.opts = opts;
    this.feed = feed;
    this.onDispose = onDispose;

    if (opts.candles) {
      this.candleBuffer = new CandleBuffer(opts.candles.maxCandles);
      this.candleInterval = opts.candles.interval;
    }
    if (opts.trades) {
      this.tradeBuffer = new RingBuffer<TradeEvent>(opts.trades.maxTrades);
    }
    if (opts.orderBook) {
      this.book = new OrderBook(symbol, opts.orderBook.maxDepth);
    }
  }

  /** Build the dxFeed candle symbol (e.g., "NFLX{=5m,tho=false,a=m}"). */
  get candleSymbol(): string | null {
    if (!this.candleInterval) return null;
    return `${this.symbol}{=${this.candleInterval},tho=false,a=m}`;
  }

  /** Subscribe all requested event types on the feed. */
  async start(): Promise<void> {
    if (this.opts.candles) {
      await this.feed.subscribe("Candle", [this.candleSymbol!], this.feedCandleCb, {
        fromTime: this.opts.candles.fromTime,
      });
    }
    if (this.opts.quotes) {
      await this.feed.subscribe("Quote", [this.symbol], this.feedQuoteCb);
    }
    if (this.opts.trades) {
      await this.feed.subscribe("Trade", [this.symbol], this.feedTradeCb);
      await this.feed.subscribe("TradeETH", [this.symbol], this.feedTradeCb);
    }
    if (this.opts.orderBook) {
      await this.feed.subscribe("Order", [this.symbol], this.feedOrderCb);
    }
  }

  // --- Push: event callbacks ---

  on(event: "candle", cb: CandleListener): void;
  on(event: "trade", cb: TradeListener): void;
  on(event: "quote", cb: QuoteListener): void;
  on(
    event: "candle" | "trade" | "quote",
    cb: CandleListener | TradeListener | QuoteListener,
  ): void {
    if (event === "candle") this.candleListeners.push(cb as CandleListener);
    else if (event === "trade") this.tradeListeners.push(cb as TradeListener);
    else if (event === "quote") this.quoteListeners.push(cb as QuoteListener);
  }

  // biome-ignore lint/complexity/noBannedTypes: callback identity comparison
  off(event: "candle" | "trade" | "quote", cb: Function): void {
    if (event === "candle") this.candleListeners = this.candleListeners.filter((c) => c !== cb);
    else if (event === "trade") this.tradeListeners = this.tradeListeners.filter((c) => c !== cb);
    else if (event === "quote") this.quoteListeners = this.quoteListeners.filter((c) => c !== cb);
  }

  // --- Pull: accumulated state ---

  getCandles(): CandleEvent[] {
    return this.candleBuffer?.getCandles() ?? [];
  }

  getLatestQuote(): QuoteEvent | null {
    return this.latestQuote;
  }

  getTrades(): TradeEvent[] {
    return this.tradeBuffer?.toArray() ?? [];
  }

  getOrderBookSnapshot(depth?: number): OrderBookSnapshot {
    if (!this.book) throw new Error("Order book not subscribed");
    return this.book.getSnapshot(depth);
  }

  // --- Lifecycle ---

  /** Wait for historical candle backfill to complete. */
  waitForBackfill(timeoutMs?: number): Promise<void> {
    if (!this.candleBuffer) return Promise.resolve();
    return this.candleBuffer.waitForBackfill(timeoutMs);
  }

  /** Switch candle interval. Clears buffer, subscribes new, unsubscribes old. */
  async setInterval(interval: string): Promise<void> {
    if (!this.opts.candles) throw new Error("Candles not subscribed");
    const oldSym = this.candleSymbol!;
    this.candleInterval = interval;
    this.opts.candles.interval = interval;
    const newSym = this.candleSymbol!;

    // Legend pattern: add new before removing old
    await this.feed.subscribe("Candle", [newSym], this.feedCandleCb, {
      fromTime: this.opts.candles.fromTime,
    });
    this.candleBuffer?.clear();
    this.feed.unsubscribe("Candle", [oldSym]);
  }

  /** Unsubscribe all event types and release resources. */
  unsubscribe(): void {
    if (this.opts.candles && this.candleSymbol) {
      this.feed.removeCallback("Candle", this.feedCandleCb);
      this.feed.unsubscribe("Candle", [this.candleSymbol]);
    }
    if (this.opts.quotes) {
      this.feed.removeCallback("Quote", this.feedQuoteCb);
      this.feed.unsubscribe("Quote", [this.symbol]);
    }
    if (this.opts.trades) {
      this.feed.removeCallback("Trade", this.feedTradeCb);
      this.feed.removeCallback("TradeETH", this.feedTradeCb);
      this.feed.unsubscribe("Trade", [this.symbol]);
      this.feed.unsubscribe("TradeETH", [this.symbol]);
    }
    if (this.opts.orderBook) {
      this.feed.removeCallback("Order", this.feedOrderCb);
      this.feed.unsubscribe("Order", [this.symbol]);
    }
    this.onDispose();
  }

  /**
   * Re-subscribe on a new feed after reconnection.
   * Called by StreamingManager — not part of the public API.
   */
  async resubscribe(feed: Feed): Promise<void> {
    this.feed = feed;
    if (this.candleBuffer) this.candleBuffer.clear();
    if (this.book) this.book.reset();
    await this.start();
  }

  // --- Internal event handlers ---

  private handleCandleEvents(events: Array<Record<string, unknown>>): void {
    if (!this.candleBuffer) return;
    for (const e of events) {
      const candle = parseCandleEvent(e);
      if (!candle) continue;
      this.candleBuffer.insert(candle);
      for (const cb of this.candleListeners) cb(candle);
    }
  }

  private handleTradeEvents(events: Array<Record<string, unknown>>): void {
    for (const e of events) {
      if (e.eventSymbol !== this.symbol) continue;
      const trade = parseTradeEvent(e);
      if (!trade) continue;
      this.tradeBuffer?.push(trade);
      for (const cb of this.tradeListeners) cb(trade);
    }
  }

  private handleQuoteEvents(events: Array<Record<string, unknown>>): void {
    for (const e of events) {
      if (e.eventSymbol !== this.symbol) continue;
      const quote = parseQuoteEvent(e);
      if (!quote) continue;
      this.latestQuote = quote;
      for (const cb of this.quoteListeners) cb(quote);
    }
  }

  private handleOrderEvents(events: Array<Record<string, unknown>>): void {
    if (!this.book) return;
    for (const e of events) {
      if (e.eventSymbol !== this.symbol) continue;
      this.book.processEvent(e);
    }
  }
}

// ---------------------------------------------------------------------------
// Event parsers
// ---------------------------------------------------------------------------

function parseCandleEvent(e: Record<string, unknown>): CandleEvent | null {
  const time = Number(e.time ?? 0);
  const open = Number(e.open ?? 0);
  if (!time || !open) return null;
  return {
    time,
    open,
    high: Number(e.high ?? 0),
    low: Number(e.low ?? 0),
    close: Number(e.close ?? 0),
    volume: Number(e.volume ?? 0),
    count: Number(e.count ?? 0),
    vwap: Number(e.vwap ?? 0),
    eventTime: Number(e.eventTime ?? 0),
  };
}

function parseTradeEvent(e: Record<string, unknown>): TradeEvent | null {
  const price = Number(e.price ?? 0);
  if (!price) return null;
  return {
    eventType: String(e.eventType ?? "Trade"),
    eventSymbol: String(e.eventSymbol ?? ""),
    eventTime: Number(e.eventTime ?? 0),
    price,
    size: Number(e.size ?? 0),
    change: Number(e.change ?? 0),
    dayVolume: Number(e.dayVolume ?? 0),
    exchangeCode: String(e.exchangeCode ?? ""),
    tickDirection: String(e.tickDirection ?? ""),
  };
}

function parseQuoteEvent(e: Record<string, unknown>): QuoteEvent | null {
  return {
    eventType: String(e.eventType ?? "Quote"),
    eventSymbol: String(e.eventSymbol ?? ""),
    eventTime: Number(e.eventTime ?? 0),
    bidPrice: Number(e.bidPrice ?? 0),
    bidSize: Number(e.bidSize ?? 0),
    bidExchangeCode: String(e.bidExchangeCode ?? ""),
    bidTime: Number(e.bidTime ?? 0),
    askPrice: Number(e.askPrice ?? 0),
    askSize: Number(e.askSize ?? 0),
    askExchangeCode: String(e.askExchangeCode ?? ""),
    askTime: Number(e.askTime ?? 0),
  };
}
