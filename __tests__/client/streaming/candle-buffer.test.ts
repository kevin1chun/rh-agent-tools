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
    expect(buf.getCandles()[0]?.open).toBe(200); // last write wins
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
    expect(buf.getCandles()[0]?.open).toBe(200);
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
    expect(() => resolveFromTime("30m")).toThrow("Invalid from duration");
    expect(() => resolveFromTime("abc")).toThrow("Invalid from duration");
  });
});
