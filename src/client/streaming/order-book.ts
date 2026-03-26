/** L2 order book state — reconstructs sorted bid/ask levels from Order events. */

export interface OrderBookLevel {
  price: number;
  size: number;
  exchangeCode: string;
  count: number;
  time: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number | null;
  midpoint: number | null;
  lastUpdated: number;
  eventCount: number;
  stale: boolean;
}

export class OrderBook {
  /** Keyed by string index (dxFeed indices are 17+ digit integers that exceed Number precision). */
  private bids = new Map<string, OrderBookLevel>();
  private asks = new Map<string, OrderBookLevel>();
  private _lastUpdated = 0;
  private _eventCount = 0;
  private _stale = false;

  constructor(
    readonly symbol: string,
    private maxDepth = 50,
  ) {}

  /** Process a single Order event and update the book. */
  processEvent(event: Record<string, unknown>): void {
    // dxLink uses "side" (Legend protocol), fallback to legacy "orderSide"/"ordeSide"
    const side = String(event.side ?? event.orderSide ?? event.ordeSide ?? "");
    const index = String(event.index ?? "");
    const price = Number(event.price ?? 0);
    const rawSize = Number(event.size ?? 0);
    const size = Number.isFinite(rawSize) ? rawSize : 0;
    const time = Number(event.time ?? event.eventTime ?? 0);

    if (!side || index === "" || index === "0" || index === "undefined") return;

    this._eventCount++;
    this._lastUpdated = Date.now();
    this._stale = false;

    const map = side === "BUY" ? this.bids : this.asks;

    if (size <= 0) {
      map.delete(index);
    } else {
      map.set(index, { price, size, exchangeCode: "", count: 0, time });
    }
  }

  /** Return a sorted snapshot of the book, truncated to `depth` levels per side. */
  getSnapshot(depth?: number): OrderBookSnapshot {
    const d = depth ?? this.maxDepth;

    const bids = [...this.bids.values()].sort((a, b) => b.price - a.price).slice(0, d);

    const asks = [...this.asks.values()].sort((a, b) => a.price - b.price).slice(0, d);

    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;

    let spread: number | null = null;
    let midpoint: number | null = null;
    if (bestBid !== null && bestAsk !== null) {
      spread = bestAsk - bestBid;
      midpoint = (bestBid + bestAsk) / 2;
    }

    return {
      symbol: this.symbol,
      bids,
      asks,
      spread,
      midpoint,
      lastUpdated: this._lastUpdated,
      eventCount: this._eventCount,
      stale: this._stale,
    };
  }

  getBestBid(): OrderBookLevel | null {
    let best: OrderBookLevel | null = null;
    for (const level of this.bids.values()) {
      if (!best || level.price > best.price) best = level;
    }
    return best;
  }

  getBestAsk(): OrderBookLevel | null {
    let best: OrderBookLevel | null = null;
    for (const level of this.asks.values()) {
      if (!best || level.price < best.price) best = level;
    }
    return best;
  }

  /** Mark the book as stale (e.g. on disconnect). */
  markStale(): void {
    this._stale = true;
  }

  /** Clear all levels (e.g. on reconnect before re-subscribing). */
  reset(): void {
    this.bids.clear();
    this.asks.clear();
    this._eventCount = 0;
    this._stale = false;
  }
}
