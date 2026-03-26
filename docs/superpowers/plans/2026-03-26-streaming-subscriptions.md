# Streaming Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified subscription API to `StreamingManager` so any consumer can declare event types (candles, quotes, trades, order book) per symbol and get managed buffers, backfill, and reconnection.

**Architecture:** `Subscription` objects own per-symbol state (CandleBuffer, RingBuffer, quote, OrderBook). `StreamingManager.subscribe()` creates them and wires them to `DxLinkFeed`. `DxLinkFeed` gets a small change: configurable `fromTime` for candle backfill. A convenience `getHistoricalCandles()` method wraps subscribe → wait → read → unsubscribe.

**Tech Stack:** TypeScript, Vitest, existing dxLink streaming infrastructure

**Spec:** `docs/superpowers/specs/2026-03-26-streaming-subscriptions-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/client/streaming/types.ts` | **Modify.** Add `CandleEvent`, `SubscribeOptions`, `CandleOptions`, `TradeOptions`, `OrderBookOptions` interfaces + `resolveFromTime()` utility. |
| `src/client/streaming/ring-buffer.ts` | **Create.** Generic bounded ring buffer for trade events. |
| `src/client/streaming/candle-buffer.ts` | **Create.** Two-phase candle buffer with backfill detection, dedup, and eviction. |
| `src/client/streaming/feed.ts` | **Modify.** Add optional `fromTime` param to `subscribe()`, deduplicate callbacks. |
| `src/client/streaming/subscription.ts` | **Create.** `Subscription` class — composes buffers, routes events, manages lifecycle. |
| `src/client/streaming/index.ts` | **Modify.** Add `subscribe()`, `getHistoricalCandles()` to `StreamingManager`, update reconnection, add exports. |
| `__tests__/client/streaming/ring-buffer.test.ts` | **Create.** RingBuffer unit tests. |
| `__tests__/client/streaming/candle-buffer.test.ts` | **Create.** CandleBuffer unit tests. |
| `__tests__/client/streaming/feed.test.ts` | **Modify.** Add tests for fromTime and callback dedup. |
| `__tests__/client/streaming/subscription.test.ts` | **Create.** Subscription unit tests. |

---

### Task 1: Types and resolveFromTime

**Files:**
- Modify: `src/client/streaming/types.ts`
- Test: `__tests__/client/streaming/candle-buffer.test.ts` (resolveFromTime tests go here — created in Task 3, but the function is tested inline in this task's commit)

- [ ] **Step 1: Add CandleEvent interface and subscription option types to types.ts**

Add these after the existing `TradeEvent` interface (after line 220):

```typescript
/** A parsed Candle event from FEED_DATA. */
export interface CandleEvent {
  time: number;       // Candle period start (epoch ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  count: number;
  vwap: number;
  eventTime: number;  // 0 for backfill, real timestamp for live
}

// ---------------------------------------------------------------------------
// Subscription Options
// ---------------------------------------------------------------------------

export interface CandleOptions {
  interval: string;
  from?: Date | string;
  maxCandles?: number;
}

export interface TradeOptions {
  maxTrades?: number;
}

export interface OrderBookOptions {
  maxDepth?: number;
}

export interface SubscribeOptions {
  candles?: CandleOptions | boolean;
  quotes?: boolean;
  trades?: TradeOptions | boolean;
  orderBook?: OrderBookOptions | boolean;
}

/** Internal resolved form — booleans normalized to config objects. */
export interface ResolvedSubscribeOptions {
  candles?: { interval: string; fromTime: number; maxCandles: number };
  quotes: boolean;
  trades?: { maxTrades: number };
  orderBook?: { maxDepth: number };
}
```

- [ ] **Step 2: Add resolveFromTime utility to types.ts**

Add at the bottom of the file:

```typescript
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const DEFAULT_FROM_TIME = 10000000000;
const DEFAULT_MAX_CANDLES = 5000;
const DEFAULT_MAX_TRADES = 500;
const DEFAULT_ORDER_BOOK_DEPTH = 50;

/** Convert a `from` option (Date, relative string, or undefined) to epoch ms. */
export function resolveFromTime(from?: Date | string): number {
  if (from === undefined) return DEFAULT_FROM_TIME;
  if (from instanceof Date) return from.getTime();
  const match = from.match(/^(\d+)(d|h)$/);
  if (!match) {
    throw new Error(`Invalid from duration: "${from}". Use "30d" or "24h".`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const ms = unit === "d" ? value * 86_400_000 : value * 3_600_000;
  return Date.now() - ms;
}

/** Normalize SubscribeOptions (booleans → config objects with defaults). */
export function resolveSubscribeOptions(opts: SubscribeOptions): ResolvedSubscribeOptions {
  const candles =
    opts.candles === true
      ? { interval: "5m", fromTime: resolveFromTime(), maxCandles: DEFAULT_MAX_CANDLES }
      : opts.candles
        ? {
            interval: opts.candles.interval,
            fromTime: resolveFromTime(opts.candles.from),
            maxCandles: opts.candles.maxCandles ?? DEFAULT_MAX_CANDLES,
          }
        : undefined;

  const trades =
    opts.trades === true
      ? { maxTrades: DEFAULT_MAX_TRADES }
      : opts.trades
        ? { maxTrades: opts.trades.maxTrades ?? DEFAULT_MAX_TRADES }
        : undefined;

  const orderBook =
    opts.orderBook === true
      ? { maxDepth: DEFAULT_ORDER_BOOK_DEPTH }
      : opts.orderBook
        ? { maxDepth: opts.orderBook.maxDepth ?? DEFAULT_ORDER_BOOK_DEPTH }
        : undefined;

  return { candles, quotes: opts.quotes ?? false, trades, orderBook };
}
```

- [ ] **Step 3: Add new types to the index.ts exports**

In `src/client/streaming/index.ts`, add to the existing export block:

```typescript
export type {
  CandleEvent,
  CandleOptions,
  EventType,
  OrderBookOptions,
  OrderEvent,
  QuoteEvent,
  StreamingTokenData,
  SubscribeOptions,
  TradeEvent,
  TradeOptions,
} from "./types.js";
export { resolveFromTime } from "./types.js";
```

(Replace the existing `export type { EventType, OrderEvent, ... }` block — consolidate into one.)

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/streaming/types.ts src/client/streaming/index.ts
git commit -m "feat(streaming): add CandleEvent, SubscribeOptions types and resolveFromTime"
```

---

### Task 2: RingBuffer

**Files:**
- Create: `src/client/streaming/ring-buffer.ts`
- Create: `__tests__/client/streaming/ring-buffer.test.ts`

- [ ] **Step 1: Write the RingBuffer tests**

```typescript
import { describe, expect, it } from "vitest";
import { RingBuffer } from "../../../src/client/streaming/ring-buffer.js";

describe("RingBuffer", () => {
  it("stores items up to capacity and returns in insertion order", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.length).toBe(3);
  });

  it("evicts oldest when pushing past capacity", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // evicts 1
    buf.push(5); // evicts 2
    expect(buf.toArray()).toEqual([3, 4, 5]);
    expect(buf.length).toBe(3);
  });

  it("clear resets to empty", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.toArray()).toEqual([]);
    expect(buf.length).toBe(0);
  });

  it("handles single capacity", () => {
    const buf = new RingBuffer<string>(1);
    buf.push("a");
    expect(buf.toArray()).toEqual(["a"]);
    buf.push("b");
    expect(buf.toArray()).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/client/streaming/ring-buffer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RingBuffer**

```typescript
/**
 * Fixed-capacity ring buffer — O(1) push, O(1) eviction.
 * Used for bounded trade event history.
 */
export class RingBuffer<T> {
  private buf: (T | undefined)[];
  private head = 0;
  private _length = 0;

  constructor(readonly capacity: number) {
    this.buf = new Array(capacity);
  }

  /** Add an item. If at capacity, the oldest item is silently evicted. */
  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._length < this.capacity) this._length++;
  }

  /** Return items in insertion order (oldest first). */
  toArray(): T[] {
    if (this._length === 0) return [];
    if (this._length < this.capacity) {
      return this.buf.slice(0, this._length) as T[];
    }
    return [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)] as T[];
  }

  get length(): number {
    return this._length;
  }

  clear(): void {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this._length = 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/client/streaming/ring-buffer.test.ts`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/streaming/ring-buffer.ts __tests__/client/streaming/ring-buffer.test.ts
git commit -m "feat(streaming): add RingBuffer for bounded trade history"
```

---

### Task 3: CandleBuffer

**Files:**
- Create: `src/client/streaming/candle-buffer.ts`
- Create: `__tests__/client/streaming/candle-buffer.test.ts`

- [ ] **Step 1: Write the CandleBuffer tests**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CandleBuffer } from "../../../src/client/streaming/candle-buffer.js";
import type { CandleEvent } from "../../../src/client/streaming/types.js";
import { resolveFromTime } from "../../../src/client/streaming/types.js";

function makeCandle(time: number, price: number, eventTime = 0): CandleEvent {
  return {
    time,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price + 0.5,
    volume: 1000,
    count: 50,
    vwap: price,
    eventTime,
  };
}

describe("CandleBuffer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("buffers candles during backfill and sorts on finalize", async () => {
    const buf = new CandleBuffer(100);
    expect(buf.isBackfilling).toBe(true);

    // Insert newest-first (backfill order)
    buf.insert(makeCandle(3000, 103));
    buf.insert(makeCandle(1000, 101));
    buf.insert(makeCandle(2000, 102));

    // Before finalize: getCandles returns unsorted
    expect(buf.length).toBe(3);

    buf.finalizeBackfill();
    expect(buf.isBackfilling).toBe(false);

    const candles = buf.getCandles();
    expect(candles.map((c) => c.time)).toEqual([1000, 2000, 3000]);
  });

  it("deduplicates candles by time during backfill", () => {
    const buf = new CandleBuffer(100);
    buf.insert(makeCandle(1000, 100));
    buf.insert(makeCandle(1000, 200)); // same time, different price
    expect(buf.length).toBe(1);

    buf.finalizeBackfill();
    expect(buf.getCandles()[0]!.open).toBe(200); // last write wins
  });

  it("transitions from backfill to live when eventTime > 0", () => {
    const buf = new CandleBuffer(100);
    buf.insert(makeCandle(1000, 100)); // backfill (eventTime=0)
    buf.insert(makeCandle(2000, 101)); // backfill
    buf.insert(makeCandle(3000, 102, Date.now())); // live! triggers finalize

    expect(buf.isBackfilling).toBe(false);
    const candles = buf.getCandles();
    expect(candles.map((c) => c.time)).toEqual([1000, 2000, 3000]);
  });

  it("updates existing candle in place during live phase", () => {
    const buf = new CandleBuffer(100);
    buf.finalizeBackfill(); // skip backfill

    buf.insert(makeCandle(1000, 100));
    buf.insert(makeCandle(1000, 200)); // update
    expect(buf.length).toBe(1);
    expect(buf.getCandles()[0]!.open).toBe(200);
  });

  it("evicts oldest candle when exceeding maxCandles during live", () => {
    const buf = new CandleBuffer(3);
    buf.finalizeBackfill();

    buf.insert(makeCandle(1000, 100));
    buf.insert(makeCandle(2000, 101));
    buf.insert(makeCandle(3000, 102));
    buf.insert(makeCandle(4000, 103)); // evicts 1000

    expect(buf.length).toBe(3);
    expect(buf.getCandles().map((c) => c.time)).toEqual([2000, 3000, 4000]);
  });

  it("evicts oldest during backfill finalize when over capacity", () => {
    const buf = new CandleBuffer(2);
    buf.insert(makeCandle(3000, 103));
    buf.insert(makeCandle(1000, 101));
    buf.insert(makeCandle(2000, 102));
    buf.finalizeBackfill();

    // Keeps the 2 most recent
    expect(buf.getCandles().map((c) => c.time)).toEqual([2000, 3000]);
  });

  it("waitForBackfill resolves when idle timer fires", async () => {
    const buf = new CandleBuffer(100);
    buf.insert(makeCandle(1000, 100));

    const promise = buf.waitForBackfill(15000);
    // Advance past the 3s idle threshold
    vi.advanceTimersByTime(3100);

    await promise;
    expect(buf.isBackfilling).toBe(false);
  });

  it("waitForBackfill resolves immediately if not backfilling", async () => {
    const buf = new CandleBuffer(100);
    buf.finalizeBackfill();
    await buf.waitForBackfill(); // should not hang
  });

  it("clear resets to backfilling state", () => {
    const buf = new CandleBuffer(100);
    buf.insert(makeCandle(1000, 100));
    buf.finalizeBackfill();

    buf.clear();
    expect(buf.isBackfilling).toBe(true);
    expect(buf.length).toBe(0);
  });
});

describe("resolveFromTime", () => {
  it("returns default for undefined", () => {
    expect(resolveFromTime()).toBe(10000000000);
  });

  it("returns epoch ms for Date object", () => {
    const d = new Date("2026-03-01T00:00:00Z");
    expect(resolveFromTime(d)).toBe(d.getTime());
  });

  it("parses relative day duration", () => {
    const before = Date.now();
    const result = resolveFromTime("30d");
    const after = Date.now();
    // Should be ~30 days ago
    expect(result).toBeGreaterThanOrEqual(before - 30 * 86_400_000);
    expect(result).toBeLessThanOrEqual(after - 30 * 86_400_000);
  });

  it("parses relative hour duration", () => {
    const before = Date.now();
    const result = resolveFromTime("24h");
    expect(result).toBeGreaterThanOrEqual(before - 24 * 3_600_000);
  });

  it("throws on invalid format", () => {
    expect(() => resolveFromTime("30m")).toThrow('Invalid from duration');
    expect(() => resolveFromTime("abc")).toThrow('Invalid from duration');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/client/streaming/candle-buffer.test.ts`
Expected: FAIL — candle-buffer module not found.

- [ ] **Step 3: Implement CandleBuffer**

```typescript
/** Two-phase candle buffer — optimized for backfill (batch) then live (append). */

import type { CandleEvent } from "./types.js";

/** Idle time after last backfill event before auto-finalizing. */
const BACKFILL_IDLE_MS = 3_000;

export class CandleBuffer {
  private items: CandleEvent[] = [];
  private index = new Map<number, number>(); // time → array index
  private _backfilling = true;
  private backfillResolvers: Array<() => void> = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private maxCandles: number) {}

  get isBackfilling(): boolean {
    return this._backfilling;
  }

  get length(): number {
    return this.items.length;
  }

  /** Insert a candle event. During backfill, appends unsorted. During live, maintains order. */
  insert(candle: CandleEvent): void {
    if (this._backfilling) {
      // Detect backfill → live transition: live candles have eventTime > 0
      if (candle.eventTime > 0) {
        this.finalizeBackfill();
        this.insertLive(candle);
        return;
      }
      this.resetIdleTimer();
      const existing = this.index.get(candle.time);
      if (existing !== undefined) {
        this.items[existing] = candle;
      } else {
        this.index.set(candle.time, this.items.length);
        this.items.push(candle);
      }
    } else {
      this.insertLive(candle);
    }
  }

  /** Sort backfill candles, trim to capacity, and transition to live mode. */
  finalizeBackfill(): void {
    if (!this._backfilling) return;
    this.clearIdleTimer();
    this._backfilling = false;

    this.items.sort((a, b) => a.time - b.time);
    if (this.items.length > this.maxCandles) {
      this.items = this.items.slice(this.items.length - this.maxCandles);
    }
    this.rebuildIndex();

    for (const resolve of this.backfillResolvers) resolve();
    this.backfillResolvers = [];
  }

  /**
   * Wait for backfill to complete. Resolves when:
   * 1. A live candle arrives (eventTime > 0), OR
   * 2. No candle events for 3s (idle timer), OR
   * 3. Timeout expires (forces finalization).
   */
  waitForBackfill(timeoutMs = 15_000): Promise<void> {
    if (!this._backfilling) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this._backfilling) this.finalizeBackfill();
      }, timeoutMs);
      this.backfillResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Return a copy of all candles, sorted by time. */
  getCandles(): CandleEvent[] {
    return this.items.slice();
  }

  /** Reset to empty backfilling state. */
  clear(): void {
    this.items = [];
    this.index.clear();
    this._backfilling = true;
    this.clearIdleTimer();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private insertLive(candle: CandleEvent): void {
    const existing = this.index.get(candle.time);
    if (existing !== undefined) {
      this.items[existing] = candle;
      return;
    }
    if (this.items.length >= this.maxCandles) {
      const evicted = this.items.shift()!;
      this.index.delete(evicted.time);
      this.rebuildIndex();
    }
    this.index.set(candle.time, this.items.length);
    this.items.push(candle);
  }

  private rebuildIndex(): void {
    this.index.clear();
    for (let i = 0; i < this.items.length; i++) {
      this.index.set(this.items[i]!.time, i);
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this._backfilling) this.finalizeBackfill();
    }, BACKFILL_IDLE_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/client/streaming/candle-buffer.test.ts`
Expected: PASS — all tests pass (CandleBuffer + resolveFromTime).

- [ ] **Step 5: Commit**

```bash
git add src/client/streaming/candle-buffer.ts __tests__/client/streaming/candle-buffer.test.ts
git commit -m "feat(streaming): add CandleBuffer with two-phase backfill strategy"
```

---

### Task 4: DxLinkFeed — configurable fromTime and callback dedup

**Files:**
- Modify: `src/client/streaming/feed.ts:94` and `src/client/streaming/feed.ts:106`
- Modify: `__tests__/client/streaming/feed.test.ts`

- [ ] **Step 1: Add tests for fromTime and callback dedup**

Append to the existing `describe("DxLinkFeed")` block in `__tests__/client/streaming/feed.test.ts`:

```typescript
  it("sends custom fromTime for Candle subscriptions", async () => {
    const mock = createMockClient();
    mock.waitFor = vi.fn().mockResolvedValue({
      type: "FEED_CONFIG",
      channel: 3,
      dataFormat: "FULL",
      eventFields: {
        Candle: [
          "close", "eventFlags", "eventSymbol", "eventType", "eventTime",
          "high", "impVolatility", "low", "open", "openInterest",
          "time", "volume", "vwap", "sequence", "count",
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
    const addEntries = (subCall![0] as Record<string, unknown>).add as Array<
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
          "close", "eventFlags", "eventSymbol", "eventType", "eventTime",
          "high", "impVolatility", "low", "open", "openInterest",
          "time", "volume", "vwap", "sequence", "count",
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
    const addEntries = (subCall![0] as Record<string, unknown>).add as Array<
      Record<string, unknown>
    >;
    expect(addEntries[0]!.fromTime).toBe(10000000000);
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
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `npx vitest run __tests__/client/streaming/feed.test.ts`
Expected: The new Candle fromTime test FAILS (wrong value — gets hardcoded `10000000000` instead of `1740000000000`). The callback dedup test FAILS (callback called twice).

- [ ] **Step 3: Modify feed.ts — add opts parameter, configurable fromTime, callback dedup**

In `src/client/streaming/feed.ts`, make these three changes:

**Change 1 — Add `opts` parameter to `subscribe` signature (line 36-40):**

```typescript
  async subscribe(
    eventType: EventType,
    symbols: string[],
    callback: EventCallback,
    opts?: { fromTime?: number },
  ): Promise<number> {
```

**Change 2 — Deduplicate callbacks (line 94):**

Replace:
```typescript
    state.callbacks.push(callback);
```
With:
```typescript
    if (!state.callbacks.includes(callback)) {
      state.callbacks.push(callback);
    }
```

**Change 3 — Use configurable fromTime (line 106):**

Replace:
```typescript
          entry.fromTime = 10000000000; // request historical candles
```
With:
```typescript
          entry.fromTime = opts?.fromTime ?? 10000000000;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/client/streaming/feed.test.ts`
Expected: PASS — all tests pass (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/client/streaming/feed.ts __tests__/client/streaming/feed.test.ts
git commit -m "feat(streaming): configurable fromTime and callback dedup in DxLinkFeed"
```

---

### Task 5: Subscription

**Files:**
- Create: `src/client/streaming/subscription.ts`
- Create: `__tests__/client/streaming/subscription.test.ts`

- [ ] **Step 1: Write the Subscription tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { Subscription } from "../../../src/client/streaming/subscription.js";
import type { CandleEvent, ResolvedSubscribeOptions } from "../../../src/client/streaming/types.js";

/** Minimal DxLinkFeed mock. */
function createMockFeed() {
  return {
    subscribe: vi.fn().mockResolvedValue(1),
    unsubscribe: vi.fn(),
    removeCallback: vi.fn(),
  };
}

function candleOpts(overrides?: Partial<ResolvedSubscribeOptions["candles"]>): ResolvedSubscribeOptions {
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
    const feedCb = feed.subscribe.mock.calls[0]![2] as (
      events: Array<Record<string, unknown>>,
    ) => void;

    // Simulate backfill candles
    feedCb([
      { time: 2000, open: 102, high: 103, low: 101, close: 102.5, volume: 500, count: 20, vwap: 102, eventTime: 0 },
      { time: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000, count: 50, vwap: 100, eventTime: 0 },
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
    const tradeFeedCb = feed.subscribe.mock.calls.find(
      (c: unknown[]) => c[0] === "Trade",
    )![2] as (events: Array<Record<string, unknown>>) => void;

    tradeFeedCb([
      { eventSymbol: "NFLX", eventType: "Trade", price: 100, size: 10, eventTime: 1, change: 0, dayVolume: 0, exchangeCode: "", tickDirection: "" },
      { eventSymbol: "NFLX", eventType: "Trade", price: 101, size: 20, eventTime: 2, change: 1, dayVolume: 0, exchangeCode: "", tickDirection: "" },
      { eventSymbol: "NFLX", eventType: "Trade", price: 102, size: 30, eventTime: 3, change: 1, dayVolume: 0, exchangeCode: "", tickDirection: "" },
    ]);

    // maxTrades=2, so oldest evicted
    const trades = sub.getTrades();
    expect(trades).toHaveLength(2);
    expect(trades[0]!.price).toBe(101);
    expect(trades[1]!.price).toBe(102);
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

    const quoteFeedCb = feed.subscribe.mock.calls.find(
      (c: unknown[]) => c[0] === "Quote",
    )![2] as (events: Array<Record<string, unknown>>) => void;

    quoteFeedCb([
      { eventSymbol: "NFLX", eventType: "Quote", bidPrice: 100, askPrice: 101, bidSize: 10, askSize: 20, bidExchangeCode: "", askExchangeCode: "", bidTime: 0, askTime: 0, eventTime: 0 },
      { eventSymbol: "NFLX", eventType: "Quote", bidPrice: 102, askPrice: 103, bidSize: 30, askSize: 40, bidExchangeCode: "", askExchangeCode: "", bidTime: 0, askTime: 0, eventTime: 0 },
    ]);

    const quote = sub.getLatestQuote();
    expect(quote?.bidPrice).toBe(102); // latest only
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/client/streaming/subscription.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Subscription**

```typescript
/** Per-symbol subscription — owns buffers, routes events, manages lifecycle. */

import { CandleBuffer } from "./candle-buffer.js";
import { OrderBook, type OrderBookSnapshot } from "./order-book.js";
import { RingBuffer } from "./ring-buffer.js";
import type {
  CandleEvent,
  QuoteEvent,
  ResolvedSubscribeOptions,
  TradeEvent,
} from "./types.js";

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

  constructor(
    symbol: string,
    opts: ResolvedSubscribeOptions,
    feed: Feed,
    onDispose: () => void,
  ) {
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

  off(event: "candle" | "trade" | "quote", cb: Function): void {
    if (event === "candle")
      this.candleListeners = this.candleListeners.filter((c) => c !== cb);
    else if (event === "trade")
      this.tradeListeners = this.tradeListeners.filter((c) => c !== cb);
    else if (event === "quote")
      this.quoteListeners = this.quoteListeners.filter((c) => c !== cb);
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
    this.candleBuffer!.clear();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/client/streaming/subscription.test.ts`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/streaming/subscription.ts __tests__/client/streaming/subscription.test.ts
git commit -m "feat(streaming): add Subscription class with buffers and lifecycle"
```

---

### Task 6: StreamingManager — subscribe() and getHistoricalCandles()

**Files:**
- Modify: `src/client/streaming/index.ts`

- [ ] **Step 1: Add imports and subscription tracking to StreamingManager**

At the top of `src/client/streaming/index.ts`, add imports:

```typescript
import { Subscription } from "./subscription.js";
import {
  type CandleEvent,
  type ResolvedSubscribeOptions,
  type SubscribeOptions,
  resolveSubscribeOptions,
} from "./types.js";
```

Add to the `StreamingManager` class, after `private books = new Map<string, OrderBook>();`:

```typescript
  private subscriptions = new Map<string, Subscription>();
```

- [ ] **Step 2: Add subscribe() method**

Add to `StreamingManager`, after `ensureConnected()`:

```typescript
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
```

- [ ] **Step 3: Update reconnection to re-subscribe all subscriptions**

In `handleDisconnect()`, after the existing book re-subscription loop (the `for (const symbol of symbols)` block), add re-subscription for all Subscriptions:

```typescript
        // Re-subscribe all Subscriptions
        for (const sub of this.subscriptions.values()) {
          await sub.resubscribe(this.feed!);
        }
```

- [ ] **Step 4: Update disconnect() to clean up subscriptions**

In the `disconnect()` method, before `this.feed?.destroy();`, add:

```typescript
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
```

- [ ] **Step 5: Update exports in index.ts**

Replace the existing export block with a consolidated version. Add these exports:

```typescript
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
```

- [ ] **Step 6: Run typecheck and all streaming tests**

Run: `bun run typecheck && npx vitest run __tests__/client/streaming/`
Expected: PASS — no type errors, all streaming tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/client/streaming/index.ts
git commit -m "feat(streaming): add subscribe() and getHistoricalCandles() to StreamingManager"
```

---

### Task 7: Full test suite pass and documentation

**Files:**
- Modify: `docs/robinhood-api-reference.md` (add note about streaming candle history)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests still pass, all new tests pass.

- [ ] **Step 2: Run typecheck and linter**

Run: `bun run typecheck && bun run check`
Expected: PASS — no errors.

- [ ] **Step 3: Add streaming historicals documentation to API reference**

In `docs/robinhood-api-reference.md`, after the "Interval / Span Compatibility" table in Section 8 (Historical Data), add:

```markdown
### Streaming Historical Candles (dxFeed WebSocket)

The REST historicals endpoint limits 5-minute candles to ~1 week. For deeper history (~6 weeks of 5-minute data), use the dxFeed WebSocket streaming API via `StreamingManager`:

```typescript
import { getClient } from "robinhood-for-agents";
import { getStreamingManager } from "robinhood-for-agents/streaming";

const client = getClient();
await client.restoreSession();

const streaming = getStreamingManager(client._session);

// One-shot: get all available 5-minute candles (~6 weeks)
const candles = await streaming.getHistoricalCandles("NFLX", {
  interval: "5m",
  from: "30d",   // optional: limit to last 30 days
});

// Or subscribe for live updates + backfill
const sub = await streaming.subscribe("NFLX", {
  candles: { interval: "5m" },
  quotes: true,
  trades: true,
});
await sub.waitForBackfill();
console.log(sub.getCandles().length, "candles loaded");
```

The streaming API provides candle data via the dxFeed `Candle` event type with `fromTime` backfill. Available intervals: `1m`, `2m`, `5m`, `30m`, `1h`, `1d`. Server provides ~6 weeks of history for intraday intervals.
```

- [ ] **Step 4: Commit**

```bash
git add docs/robinhood-api-reference.md
git commit -m "docs: add streaming historical candles to API reference"
```
