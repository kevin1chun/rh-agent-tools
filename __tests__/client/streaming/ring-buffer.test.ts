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
