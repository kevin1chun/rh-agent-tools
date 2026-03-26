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
