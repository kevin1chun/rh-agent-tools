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
      // biome-ignore lint/style/noNonNullAssertion: index within bounds
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
