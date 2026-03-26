/** Streaming module — manages dxLink connection and order book state. */

import type { RobinhoodSession } from "../session.js";
import { DxLinkClient } from "./dxlink-client.js";
import { DxLinkFeed } from "./feed.js";
import { OrderBook, type OrderBookSnapshot } from "./order-book.js";
import { StreamingAuth } from "./streaming-auth.js";
import { Subscription } from "./subscription.js";
import { type CandleEvent, resolveSubscribeOptions, type SubscribeOptions } from "./types.js";

export { DxLinkClient } from "./dxlink-client.js";
export {
  StreamingAuthError,
  StreamingConnectionError,
  StreamingError,
  StreamingProtocolError,
} from "./errors.js";
export { DxLinkFeed } from "./feed.js";
export type { OrderBookLevel, OrderBookSnapshot } from "./order-book.js";
export { OrderBook } from "./order-book.js";
export { StreamingAuth } from "./streaming-auth.js";
export { Subscription } from "./subscription.js";
export type {
  CandleEvent,
  CandleOptions,
  EventType,
  OrderBookOptions,
  OrderEvent,
  QuoteEvent,
  ResolvedSubscribeOptions,
  StreamingTokenData,
  SubscribeOptions,
  TradeEvent,
  TradeOptions,
} from "./types.js";
export { resolveFromTime, resolveSubscribeOptions } from "./types.js";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/** Delay for initial book population after subscribe. */
const BOOK_SETTLE_MS = 3_000;

export class StreamingManager {
  private client: DxLinkClient | null = null;
  private feed: DxLinkFeed | null = null;
  private auth: StreamingAuth;
  private session: RobinhoodSession;
  private books = new Map<string, OrderBook>();
  private subscriptions = new Map<string, Subscription>();
  private reconnectAttempts = 0;
  private reconnecting = false;

  constructor(session: RobinhoodSession) {
    this.session = session;
    this.auth = new StreamingAuth(session);
  }

  /** Build WebSocket upgrade headers (Authorization + Origin). */
  private upgradeHeaders(): Record<string, string> {
    const token = this.session.getAuthTokenForRevocation();
    const headers: Record<string, string> = { Origin: "https://robinhood.com" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  /** Ensure the WebSocket connection is established. */
  async ensureConnected(): Promise<void> {
    if (this.client?.isConnected) return;

    const tokenData = await this.auth.ensureToken();

    const client = new DxLinkClient();
    client.on("close", () => this.handleDisconnect());

    await client.connect(tokenData.wss_url, tokenData.token, {
      headers: this.upgradeHeaders(),
    });

    this.client = client;
    this.feed = new DxLinkFeed(client);
    this.reconnectAttempts = 0;
  }

  /**
   * Subscribe to streaming events for a symbol.
   * Returns a Subscription that owns buffers and callbacks.
   */
  async subscribe(symbol: string, opts: SubscribeOptions): Promise<Subscription> {
    const upper = symbol.toUpperCase();
    if (this.subscriptions.has(upper)) {
      throw new Error(
        `Already subscribed to ${upper}. Call unsubscribe() first or use setInterval() to change candle params.`,
      );
    }

    await this.ensureConnected();

    const resolved = resolveSubscribeOptions(opts);
    const sub = new Subscription(upper, resolved, this.feed!, () =>
      this.subscriptions.delete(upper),
    );
    this.subscriptions.set(upper, sub);
    await sub.start();
    return sub;
  }

  /**
   * One-shot: connect, collect historical candle backfill, return, disconnect.
   * Convenience for programmatic consumers that just want data.
   */
  async getHistoricalCandles(
    symbol: string,
    opts?: { interval?: string; from?: Date | string },
  ): Promise<CandleEvent[]> {
    const sub = await this.subscribe(symbol, {
      candles: {
        interval: opts?.interval ?? "5m",
        from: opts?.from,
      },
    });
    await sub.waitForBackfill();
    const candles = sub.getCandles();
    sub.unsubscribe();
    return candles;
  }

  /**
   * Subscribe to L2 order book for a symbol.
   * Returns immediately; the book populates asynchronously.
   */
  async subscribeOrderBook(symbol: string): Promise<void> {
    await this.ensureConnected();

    if (this.books.has(symbol)) return;

    const book = new OrderBook(symbol);
    this.books.set(symbol, book);

    await this.feed?.subscribe("Order", [symbol], (events) => {
      for (const event of events) {
        if (event.eventSymbol === symbol) {
          book.processEvent(event);
        }
      }
    });
  }

  /**
   * Get the current order book snapshot.
   * Auto-subscribes if not yet subscribed, waits for initial data.
   */
  async getOrderBookSnapshot(symbol: string, depth?: number): Promise<OrderBookSnapshot> {
    if (!this.books.has(symbol)) {
      await this.subscribeOrderBook(symbol);
      // Wait for the book to populate
      await this.waitForBookData(symbol, BOOK_SETTLE_MS);
    }
    const book = this.books.get(symbol);
    if (!book) throw new Error(`Order book for ${symbol} not found`);
    return book.getSnapshot(depth);
  }

  /** Unsubscribe from L2 order book for a symbol. */
  unsubscribeOrderBook(symbol: string): void {
    const book = this.books.get(symbol);
    if (!book) return;

    this.feed?.unsubscribe("Order", [symbol]);
    this.books.delete(symbol);
  }

  /** Disconnect and clean up all state. */
  disconnect(): void {
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
    this.feed?.destroy();
    this.feed = null;
    this.client?.disconnect();
    this.client = null;
    for (const book of this.books.values()) book.markStale();
  }

  /** Wait for at least one event in the book, up to timeoutMs. */
  private waitForBookData(symbol: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const book = this.books.get(symbol);
      if (!book) {
        resolve();
        return;
      }

      const start = Date.now();
      const check = () => {
        const snap = book.getSnapshot(1);
        if (snap.eventCount > 0 || Date.now() - start >= timeoutMs) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  private async handleDisconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    // Mark all books stale
    for (const book of this.books.values()) book.markStale();

    while (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(BASE_DELAY_MS * 2 ** this.reconnectAttempts, MAX_DELAY_MS);
      const jitter = Math.random() * 1000;
      await new Promise<void>((r) => setTimeout(r, delay + jitter));
      this.reconnectAttempts++;

      try {
        // Clean up old client
        this.feed?.destroy();
        this.feed = null;
        this.client?.disconnect();
        this.client = null;

        // Reconnect
        const tokenData = await this.auth.fetchToken();
        const client = new DxLinkClient();
        client.on("close", () => this.handleDisconnect());
        await client.connect(tokenData.wss_url, tokenData.token, {
          headers: this.upgradeHeaders(),
        });

        this.client = client;
        this.feed = new DxLinkFeed(client);

        // Re-subscribe all books
        const symbols = [...this.books.keys()];
        for (const book of this.books.values()) book.reset();

        for (const symbol of symbols) {
          const book = this.books.get(symbol);
          if (book) {
            await this.feed.subscribe("Order", [symbol], (events) => {
              for (const event of events) {
                if (event.eventSymbol === symbol) {
                  book.processEvent(event);
                }
              }
            });
          }
        }

        // Re-subscribe all Subscriptions
        for (const sub of this.subscriptions.values()) {
          await sub.resubscribe(this.feed!);
        }

        this.reconnectAttempts = 0;
        this.reconnecting = false;
        return;
      } catch {
        // Retry
      }
    }

    this.reconnecting = false;
    // Exhausted attempts — go dormant. Next tool call will retry.
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _manager: StreamingManager | null = null;

export function getStreamingManager(session: RobinhoodSession): StreamingManager {
  if (!_manager) {
    _manager = new StreamingManager(session);
  }
  return _manager;
}

/** Reset the singleton (for testing). */
export function resetStreamingManager(): void {
  _manager?.disconnect();
  _manager = null;
}
