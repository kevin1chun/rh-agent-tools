# Stream Viewer — Reference Usage of dxLink Feeds

The stream viewer (`bin/stream-viewer.ts`) is a complete reference implementation that consumes all 5 dxLink feed types, merges them with REST historical data, and renders an interactive TradingView-style chart in the browser. It demonstrates how to build a real-time trading UI on top of the streaming infrastructure.

## Running

```bash
bun bin/stream-viewer.ts [symbol] [--port 8080]
```

Opens at `http://127.0.0.1:8080`. Default symbol is SPY, default timeframe 5m.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Robinhood dxLink WebSocket                           │
│ DxLinkClient → DxLinkFeed                            │
│ Subscribes: Trade, TradeETH, Quote, Candle, Order    │
└──────────────────┬───────────────────────────────────┘
                   │ callbacks (tradeCb, quoteCb,
                   │ candleCb, orderCb)
                   ▼
┌──────────────────────────────────────────────────────┐
│ Bun HTTP Server (stream-viewer.ts)                   │
│                                                      │
│ State: candles[], lastTrade, quote, OrderBook         │
│ L2 aggregation: getBucketSize() + aggregateLevels()  │
│ Book broadcast at 4Hz (250ms interval)               │
│                                                      │
│ Endpoints: /, /stream, /search, /switch,             │
│            /interval, /history, /historicals          │
└──────────────────┬───────────────────────────────────┘
                   │ Server-Sent Events (/stream)
                   │ Events: trade, quote, candles,
                   │ book, symbolChanged, intervalChanged
                   ▼
┌──────────────────────────────────────────────────────┐
│ Browser SPA (inline HTML/JS)                         │
│                                                      │
│ EventSource('/stream') listener                      │
│ Canvas renderer @ 60fps (requestAnimationFrame)      │
│ Interactive: pan, zoom, crosshair, L2 toggle         │
│ Symbol search, timeframe buttons, infinite scroll    │
└──────────────────────────────────────────────────────┘
```

## Feed Subscriptions

All 5 event types are subscribed via `DxLinkFeed.subscribe()`. Each uses a named callback that filters by `currentSymbol` and updates server state.

### Trade / TradeETH

```typescript
await feed.subscribe("Trade", [symbol], tradeCb);
await feed.subscribe("TradeETH", [symbol], tradeCb);
```

Both use the same callback. Extracts `price`, `size`, `change`, `tickDirection` from each event. Updates `state.lastTrade` and broadcasts a `trade` SSE event per tick. Also updates the live candle's close/high/low for real-time price tracking between Candle events.

TradeETH provides pre-market and after-hours trades. Crypto symbols (`DOGE/USD:CXBITS`) only use Trade (24/7 market). Options use Trade only (no extended hours).

### Quote

```typescript
await feed.subscribe("Quote", [symbol], quoteCb);
```

Extracts `bidPrice`, `bidSize`, `askPrice`, `askSize`. Updates `state.quote` and broadcasts a `quote` SSE event. Displayed in the header as `Bid {price} x {size} | Ask {price} x {size}`.

### Candle

```typescript
function candleSym(sym: string, tf?: string) {
  return `${sym}{=${tf ?? currentInterval},tho=false,a=m}`;
}
await feed.subscribe("Candle", [candleSym(symbol)], candleCb);
```

The symbol includes the candle specification: `SPY{=5m,tho=false,a=m}` means 5-minute candles, include extended hours, market aggregation.

Extracts `time`/`eventTime`, `open`, `high`, `low`, `close`, `volume`. Upserts into `state.candles` by timestamp (updates existing candle or appends new). Array kept sorted by time, capped at 10,000 entries. Broadcasts the full candles array on each update.

### Order (L2)

```typescript
await feed.subscribe("Order", [symbol], orderCb);
```

Raw Order events are passed directly to `state.book.processEvent(e)`, which maintains the `OrderBook` (bids/asks maps keyed by dxFeed index). The book is **not** broadcast per-event — instead a 250ms interval aggregates and broadcasts snapshots (see L2 Price Aggregation below).

## SSE Event Protocol

The `/stream` endpoint provides Server-Sent Events. On connect, the server immediately sends cached state (`symbolChanged`, `quote`, `trade`, `candles`).

| Event | Payload | Trigger |
|-------|---------|---------|
| `trade` | `{price, size, change, tickDirection, t}` | Each Trade/TradeETH event |
| `quote` | `{bidPrice, bidSize, askPrice, askSize, time}` | Each Quote event |
| `candles` | `CandleData[]` (full array) | After candle upsert |
| `book` | `{bids, asks, spread, midpoint, eventCount}` | Every 250ms (4Hz) |
| `symbolChanged` | `{symbol, interval}` | After symbol switch |
| `intervalChanged` | `{interval}` | After timeframe switch |

## HTTP Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Returns the single-page HTML app |
| `/stream` | GET | SSE connection for real-time updates |
| `/search?q=` | GET | Symbol search via `client.findInstruments()`, returns top 12 |
| `/switch?symbol=` | GET | Unsubscribes old symbol, resets state, subscribes new, loads history |
| `/interval?tf=` | GET | Switches candle timeframe (1m, 2m, 5m, 30m, 1h, 1d) |
| `/history` | GET | Returns current `state.candles` array |
| `/historicals` | GET | Fetches older candles via REST, merges into state, returns updated array |

## L2 Price Aggregation

Raw Order events produce individual price levels (penny-level for high-priced stocks). Before broadcasting, the server aggregates levels into price buckets based on stock price:

| Stock Price | Bucket Size | Example |
|-------------|-------------|---------|
| < $1 | $0.001 | Sub-penny stocks |
| $1–$10 | $0.01 | Penny-level |
| $10–$50 | $0.02 | 2-cent buckets |
| $50–$200 | $0.05 | Nickel buckets |
| $200–$1000 | $0.10 | Dime buckets |
| $1000+ | $0.25 | Quarter buckets |

Aggregation logic:
- **Bids round down** (`Math.floor`) — buckets toward the spread
- **Asks round up** (`Math.ceil`) — buckets toward the spread
- Sizes within each bucket are summed
- Result sorted: bids descending (best first), asks ascending (best first)

The midpoint price (from the book snapshot) determines the bucket size. Raw snapshot fetches 500 levels per side to ensure enough data for meaningful aggregation.

## REST Historical Integration

Streaming candles only provide data from subscription time forward. To fill the chart with prior data, `loadHistory()` fetches candles via the REST API on startup and on symbol/timeframe changes.

### Timeframe-to-REST Mapping

| UI Timeframe | REST `interval` | REST `span` |
|-------------|----------------|-------------|
| 1m, 2m, 5m | `5minute` | `day` |
| 30m | `hour` | `week` |
| 1h | `hour` | `month` |
| 1d | `day` | `year` |

### Merge Strategy

1. REST returns historical candles with `begins_at` (ISO timestamp)
2. Each candle is converted to `{time, open, high, low, close, volume}`
3. Candles are merged into `state.candles` — duplicates (same `time`) are skipped
4. Array re-sorted by time after merge
5. Streaming Candle events continue to upsert, keeping the chart live

### Infinite Scroll

When the user pans left and the viewport reaches candle index ≤ 2, the browser triggers `fetch('/historicals')` to load more history. Stops when no new candles are returned.

## State Management

| Property | Type | Reset on Symbol Switch | Reset on Interval Switch |
|----------|------|----------------------|------------------------|
| `state.candles` | `CandleData[]` | Cleared | Cleared |
| `state.lastTrade` | `{price, size, change, tickDirection}` | Null | Kept |
| `state.quote` | `{bidPrice, bidSize, askPrice, askSize, time}` | Null | Kept |
| `state.book` | `OrderBook` instance | New instance | Kept |
| `state.tradeHistory` | `TradePoint[]` | Cleared | Kept |

On symbol switch, the server unsubscribes all 5 feeds from the old symbol, resets state, subscribes to the new symbol, and loads history.

On interval switch, only the Candle subscription is changed (unsubscribe old candle spec, subscribe new). Other feeds continue uninterrupted.

## Chart UI

### Canvas Rendering (60fps)

The chart renders via `requestAnimationFrame` with these layers (bottom to top):

1. **Background** — solid `#0a0a0c`
2. **Price grid** — horizontal lines with dynamic step (`niceStep()`) and right-edge price labels
3. **Time labels** — evenly spaced timestamps along bottom edge
4. **L2 depth overlay** — horizontal bars from right edge (green bids, red asks), toggleable via L2 button. Opacity: 0.25 normal, 0.45 for best bid/ask.
5. **Volume bars** — semi-transparent (alpha 0.35) below price axis, green (up) / red (down)
6. **Separator line** — between price and volume areas
7. **Candlesticks** — hollow outline (up/green) or filled (down/red), with wicks
8. **Current price line** — dashed horizontal line at latest close, colored label on right edge
9. **Crosshair** — follows cursor with price label (right) and time label (bottom)
10. **Scroll-to-live button** — appears when panned away from latest data

### Interactions

| Action | Effect |
|--------|--------|
| Mouse wheel | Zoom candles at cursor position (2px–40px width) |
| Shift + wheel | Horizontal scroll |
| Wheel over price axis | Zoom price scale |
| Click + drag | Pan (horizontal + vertical if price not auto-fit) |
| Drag on price axis | Scale price axis vertically |
| Double-click price axis | Reset to auto-fit |
| `/` key | Open symbol search |
| L2 button | Toggle depth overlay on chart |
| Timeframe buttons | Switch candle period |
| Two-finger pinch (touch) | Zoom candles |
| One-finger drag (touch) | Pan |

### OHLCV Header

The header shows O/H/L/C/V for the candle under the crosshair, or the latest visible candle when no crosshair is active. This provides immediate context for any candle the user hovers over.

## See Also

- [Robinhood API Reference — Section 3: Real-Time Market Data](robinhood-api-reference.md#3-real-time-market-data) — dxLink protocol details
- [Robinhood API Reference — Section 4: L2 Order Book](robinhood-api-reference.md#4-l2-order-book) — Order event processing and book construction
- `src/client/streaming/` — Core streaming library (DxLinkClient, DxLinkFeed, OrderBook, StreamingAuth)
