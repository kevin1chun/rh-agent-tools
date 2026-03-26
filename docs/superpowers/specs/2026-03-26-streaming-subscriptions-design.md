# Streaming Subscriptions: Unified Event Subscription API

**Date:** 2026-03-26
**Status:** Draft

## Problem

`StreamingManager` only supports L2 order book subscriptions. Candle, Quote, and Trade events are handled ad-hoc in `bin/stream-viewer.ts`, which manually wires up `DxLinkFeed`, manages its own state buffers, handles symbol/interval switching, and supplements with REST historicals. Every future consumer (MCP tools, programmatic clients, new UIs) would duplicate this work.

Meanwhile, Robinhood's dxFeed WebSocket provides ~6 weeks of historical 5-minute candle backfill via `fromTime` on the Candle subscription — far more than the REST API's ~1 week limit. This capability is currently unused outside of stream-viewer.

## Goals

1. `StreamingManager` becomes a unified subscription hub for all dxFeed event types
2. Clients declare what they want per-symbol; StreamingManager handles connection, subscriptions, state, buffering, and reconnection
3. Historical candle backfill is first-class — configurable depth, with a one-shot convenience method
4. All buffers are bounded with sensible defaults and per-subscription overrides
5. `stream-viewer.ts` simplifies to a thin wrapper

## Non-Goals

- Aggregating candles client-side (e.g., building 15m candles from 5m candles)
- REST historical backfill fallback (can be added later)
- Crypto candle support (dxFeed symbol format differs; future work)
- Options candle support (uses `price=mark` instead of `tho`; future work)

## Design

### Subscription API

```typescript
interface CandleOptions {
  interval: string;       // "1m", "2m", "5m", "30m", "1h", "1d"
  from?: Date | string;   // Date object or relative duration ("30d", "7d")
                          // Default: all available history (fromTime=10000000000)
  maxCandles?: number;    // Buffer cap. Default: 5000. Oldest evicted first.
}

interface TradeOptions {
  maxTrades?: number;     // Buffer cap. Default: 500. Oldest evicted first.
}

interface OrderBookOptions {
  maxDepth?: number;      // Max levels per side. Default: 50.
}

interface SubscribeOptions {
  candles?: CandleOptions | boolean;  // true = { interval: "5m" }
  quotes?: boolean;
  trades?: TradeOptions | boolean;    // true = defaults
  orderBook?: OrderBookOptions | boolean;
}
```

Usage:

```typescript
const streaming = getStreamingManager(session);

// Full subscription
const sub = await streaming.subscribe("NFLX", {
  candles: { interval: "5m", from: "30d", maxCandles: 5000 },
  trades: { maxTrades: 500 },
  quotes: true,
  orderBook: true,
});

// Minimal — just candles
const sub2 = await streaming.subscribe("AAPL", {
  candles: { interval: "1h" },
});
```

### Subscription Object

`subscribe()` returns a `Subscription` object that owns the per-symbol state and callbacks.

```typescript
class Subscription {
  readonly symbol: string;

  // --- Push: event callbacks ---
  on(event: "candle", cb: (candle: CandleEvent) => void): void;
  on(event: "trade",  cb: (trade: TradeEvent) => void): void;
  on(event: "quote",  cb: (quote: QuoteEvent) => void): void;
  off(event: string, cb: Function): void;

  // --- Pull: accumulated state ---
  getCandles(): CandleEvent[];
  getLatestQuote(): QuoteEvent | null;
  getTrades(): TradeEvent[];
  getOrderBookSnapshot(depth?: number): OrderBookSnapshot;

  // --- Lifecycle ---
  /** Wait for historical candle backfill to complete. */
  waitForBackfill(timeoutMs?: number): Promise<void>;

  /** Switch candle interval. Clears candle buffer, re-subscribes. */
  setInterval(interval: string): Promise<void>;

  /** Unsubscribe all event types for this symbol. */
  unsubscribe(): void;
}
```

### Buffer Defaults and Eviction

| Buffer | Default Cap | Eviction | Notes |
|--------|------------|----------|-------|
| Candles | 5000 | Drop oldest | Sorted by `time`. Deduped by `time` (update in place). |
| Trades | 500 | Drop oldest | Rolling time & sales window. |
| Quote | 1 | Replace | Only latest quote retained. |
| Order book | 50 levels/side | Existing `OrderBook` behavior | Already bounded by `maxDepth`. |

Eviction is silent — no error, no callback. The consumer sees a sliding window.

### Data Structures and Algorithmic Complexity

Naive approach (stream-viewer's current code) uses `findIndex()` O(n) per insert + `sort()` O(n log n) after each event. With 5000+ candles arriving during backfill, this is wasteful.

**Candle buffer — two-phase strategy:**

The backfill and live phases have different access patterns, so we optimize for each:

1. **Backfill phase** (candles arrive newest-first):
   - Collect into an unsorted array. No per-event sorting.
   - Track seen timestamps in a `Map<number, number>` (`time` → array index) for O(1) dedup.
   - On backfill complete: single `sort()` pass — O(n log n) total, not per-event.
   - Rebuild the index map after sort (indices changed).

2. **Live phase** (candles arrive in time order):
   - **Update existing candle** (same `time`): O(1) lookup via the index map, overwrite in place.
   - **New candle** (new `time`): append to end — O(1). Array stays sorted because live candles arrive in order.
   - **Eviction**: when `length > maxCandles`, `shift()` from front + delete the evicted key from the index map. O(1) amortized. (Shifting an array is O(n) in theory, but we can use a circular buffer or track a start offset to make it truly O(1) if profiling shows this matters.)

3. **`getCandles()`**: returns a slice of the internal array — O(k) where k = number of candles. No sorting needed; array is always sorted after backfill completes.

**Trade buffer — ring buffer:**

Trades are append-only with a fixed capacity. A ring buffer (fixed-size array + head/tail pointers) gives O(1) insert and O(1) eviction with no shifting. `getTrades()` returns the buffer contents in chronological order.

**Quote — single value:**

Just a property. O(1) read and write.

**Complexity summary:**

| Operation | Candle (backfill) | Candle (live) | Trade | Quote |
|-----------|-------------------|---------------|-------|-------|
| Insert | O(1) amortized | O(1) | O(1) | O(1) |
| Dedup | O(1) via Map | O(1) via Map | N/A | N/A |
| Eviction | N/A | O(1) amortized | O(1) | N/A |
| Sort | O(n log n) once | Not needed | Not needed | N/A |
| Read all | O(n) | O(n) | O(n) | O(1) |

### Backfill Detection

dxFeed sends historical candles newest-first with `eventTime: 0`. The live candle has a real `eventTime` and `eventFlags: 4` (TX_PENDING). Backfill is considered complete when:

1. A candle arrives with `eventTime > 0` (live candle), OR
2. No candle events received for 3 seconds after the last batch (server finished sending)

`waitForBackfill()` resolves when either condition is met. Default timeout: 15 seconds.

### `getHistoricalCandles()` Convenience Method

One-shot method on `StreamingManager` for programmatic consumers that just want data:

```typescript
async getHistoricalCandles(
  symbol: string,
  opts?: { interval?: string; from?: Date | string },
): Promise<CandleEvent[]>
```

Implementation is sugar over subscribe:

```typescript
async getHistoricalCandles(symbol, opts) {
  const sub = await this.subscribe(symbol, {
    candles: { interval: opts?.interval ?? "5m", from: opts?.from },
  });
  await sub.waitForBackfill();
  const candles = sub.getCandles();
  sub.unsubscribe();
  return candles;
}
```

### `from` Parameter Resolution

The `from` option on `CandleOptions` converts to the dxFeed `fromTime` (epoch ms):

| Input | Resolution |
|-------|-----------|
| `undefined` | `10000000000` (all available history) |
| `Date` object | `date.getTime()` |
| `"30d"` | `Date.now() - 30 * 86400000` |
| `"7d"` | `Date.now() - 7 * 86400000` |

Supported suffixes: `d` (days) and `h` (hours). No `m` suffix — it's ambiguous with candle interval notation.

### Candle Symbol Format

The dxFeed candle symbol is derived from the ticker + interval:

```
NFLX{=5m,tho=false,a=m}
```

- `=5m` — candle period
- `tho=false` — include extended hours data
- `a=m` — market aggregation

The Subscription builds this internally from `symbol` + `interval`. The consumer never sees it.

### Connection Lifecycle

```
StreamingManager.subscribe("NFLX", opts)
  │
  ├─ ensureConnected()          // Reuse existing dxLink connection or connect
  │   └─ DxLinkClient.connect() // One shared WebSocket
  │
  ├─ Create Subscription        // Owns buffers + callbacks for NFLX
  │
  └─ DxLinkFeed.subscribe()     // For each requested event type:
      ├─ Candle: "NFLX{=5m,tho=false,a=m}" with fromTime
      ├─ Quote: "NFLX"
      ├─ Trade: "NFLX"
      ├─ TradeETH: "NFLX"
      └─ Order: "NFLX" with source="NTV"
```

All subscriptions share one `DxLinkClient` WebSocket connection. Each event type gets its own channel (existing `DxLinkFeed` behavior).

### Multiple Subscriptions Per Symbol

`StreamingManager` tracks subscriptions by symbol. Calling `subscribe("NFLX", ...)` when an NFLX subscription already exists throws an error. The caller must `unsubscribe()` the existing one first, or use `setInterval()` to change candle parameters on the existing subscription. This prevents conflicting buffer configs and duplicate event handlers for the same symbol.

### Reconnection

On disconnect, `StreamingManager` already has exponential backoff reconnection. Currently it only re-subscribes Order books. The change: **re-subscribe all active Subscriptions** — iterate `this.subscriptions`, re-issue `DxLinkFeed.subscribe()` for each event type on each Subscription, and re-request candle backfill.

### `setInterval()` Behavior

Follows the Legend pattern documented in the API reference:

1. Subscribe new candle symbol (e.g., `NFLX{=1h,tho=false,a=m}`)
2. Clear candle buffer
3. Unsubscribe old candle symbol (e.g., `NFLX{=5m,tho=false,a=m}`)

This ensures no gap in data delivery.

### CandleEvent Type

```typescript
interface CandleEvent {
  time: number;          // Candle period start (epoch ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  count: number;         // Number of trades in candle
  vwap: number;
  eventTime: number;     // 0 for backfill, real timestamp for live
}
```

## File Changes

| File | Change |
|------|--------|
| `src/client/streaming/subscription.ts` | **New.** `Subscription` class — per-symbol state, buffers, callbacks, eviction. |
| `src/client/streaming/index.ts` | Extend `StreamingManager` with `subscribe()`, `getHistoricalCandles()`, subscription tracking, reconnection for all types. |
| `src/client/streaming/types.ts` | Add `CandleEvent` interface. Export `SubscribeOptions`, `CandleOptions`, etc. |
| `src/client/streaming/feed.ts` | No changes needed — already supports Candle subscriptions. |
| `bin/stream-viewer.ts` | Refactor to use `StreamingManager.subscribe()` instead of raw `DxLinkFeed`. |

## Testing

- **Unit tests** for `Subscription` buffer management: insert, dedup, eviction at capacity, sort order.
- **Unit tests** for `from` parameter resolution (Date, relative string, undefined).
- **Unit tests** for backfill detection logic (eventTime transitions).
- **Unit tests** for `setInterval()` — verifies old symbol unsubscribed, new subscribed, buffer cleared.
- **Integration test** with mocked `DxLinkFeed` — subscribe, receive synthetic backfill events, verify `getCandles()` returns sorted data.

All tests mock the WebSocket layer — no real API calls.
