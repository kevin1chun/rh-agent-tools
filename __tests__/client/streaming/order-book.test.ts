import { describe, expect, it } from "vitest";
import { OrderBook } from "../../../src/client/streaming/order-book.js";

function makeOrderEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventType: "Order",
    eventSymbol: "SPY",
    eventTime: Date.now(),
    index: 1,
    orderSide: "BUY",
    scope: "AGGREGATE",
    price: 500,
    size: 100,
    exchangeCode: "Q",
    source: "NTV",
    marketMaker: "",
    count: 1,
    ...overrides,
  };
}

describe("OrderBook", () => {
  it("adds bids and asks", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "SELL", price: 501, size: 50 }));

    const snap = book.getSnapshot();
    expect(snap.bids).toHaveLength(1);
    expect(snap.asks).toHaveLength(1);
    expect(snap.bids[0]?.price).toBe(500);
    expect(snap.asks[0]?.price).toBe(501);
  });

  it("sorts bids descending and asks ascending", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 498, size: 10 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "BUY", price: 500, size: 20 }));
    book.processEvent(makeOrderEvent({ index: 3, orderSide: "BUY", price: 499, size: 15 }));
    book.processEvent(makeOrderEvent({ index: 4, orderSide: "SELL", price: 503, size: 5 }));
    book.processEvent(makeOrderEvent({ index: 5, orderSide: "SELL", price: 501, size: 25 }));
    book.processEvent(makeOrderEvent({ index: 6, orderSide: "SELL", price: 502, size: 30 }));

    const snap = book.getSnapshot();
    expect(snap.bids.map((b) => b.price)).toEqual([500, 499, 498]);
    expect(snap.asks.map((a) => a.price)).toEqual([501, 502, 503]);
  });

  it("removes levels when size is 0", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "BUY", price: 499, size: 50 }));

    expect(book.getSnapshot().bids).toHaveLength(2);

    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 0 }));
    expect(book.getSnapshot().bids).toHaveLength(1);
    expect(book.getSnapshot().bids[0]?.price).toBe(499);
  });

  it("updates existing levels by index", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 200 }));

    const snap = book.getSnapshot();
    expect(snap.bids).toHaveLength(1);
    expect(snap.bids[0]?.size).toBe(200);
  });

  it("truncates to requested depth", () => {
    const book = new OrderBook("SPY");
    for (let i = 0; i < 20; i++) {
      book.processEvent(
        makeOrderEvent({ index: i + 1, orderSide: "BUY", price: 500 - i, size: 10 }),
      );
    }

    expect(book.getSnapshot(5).bids).toHaveLength(5);
    expect(book.getSnapshot(5).bids[0]?.price).toBe(500);
  });

  it("calculates spread and midpoint", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "SELL", price: 501, size: 50 }));

    const snap = book.getSnapshot();
    expect(snap.spread).toBe(1);
    expect(snap.midpoint).toBe(500.5);
  });

  it("returns null spread when book is one-sided", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));

    const snap = book.getSnapshot();
    expect(snap.spread).toBeNull();
    expect(snap.midpoint).toBeNull();
  });

  it("getBestBid and getBestAsk", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 498, size: 10 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "BUY", price: 500, size: 20 }));
    book.processEvent(makeOrderEvent({ index: 3, orderSide: "SELL", price: 501, size: 5 }));
    book.processEvent(makeOrderEvent({ index: 4, orderSide: "SELL", price: 503, size: 15 }));

    expect(book.getBestBid()?.price).toBe(500);
    expect(book.getBestAsk()?.price).toBe(501);
  });

  it("returns null for empty sides", () => {
    const book = new OrderBook("SPY");
    expect(book.getBestBid()).toBeNull();
    expect(book.getBestAsk()).toBeNull();
  });

  it("reset clears the book", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "SELL", price: 501, size: 50 }));

    book.reset();
    const snap = book.getSnapshot();
    expect(snap.bids).toHaveLength(0);
    expect(snap.asks).toHaveLength(0);
    expect(snap.eventCount).toBe(0);
  });

  it("markStale sets stale flag", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    expect(book.getSnapshot().stale).toBe(false);

    book.markStale();
    expect(book.getSnapshot().stale).toBe(true);
  });

  it("tracks event count", () => {
    const book = new OrderBook("SPY");
    expect(book.getSnapshot().eventCount).toBe(0);

    book.processEvent(makeOrderEvent({ index: 1, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 2, orderSide: "SELL", price: 501, size: 50 }));
    expect(book.getSnapshot().eventCount).toBe(2);
  });

  it("ignores events without side or index", () => {
    const book = new OrderBook("SPY");
    book.processEvent(makeOrderEvent({ index: 0, orderSide: "BUY", price: 500, size: 100 }));
    book.processEvent(makeOrderEvent({ index: 1, orderSide: "", price: 500, size: 100 }));

    expect(book.getSnapshot().bids).toHaveLength(0);
    expect(book.getSnapshot().eventCount).toBe(0);
  });

  it("supports ordeSide field name (dxFeed typo)", () => {
    const book = new OrderBook("SPY");
    book.processEvent({
      eventType: "Order",
      eventSymbol: "SPY",
      eventTime: Date.now(),
      index: 1,
      ordeSide: "BUY",
      price: 500,
      size: 100,
    });

    expect(book.getSnapshot().bids).toHaveLength(1);
  });
});
