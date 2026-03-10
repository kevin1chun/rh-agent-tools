# Research — Client API

TypeScript methods from `@investwithtaji/rh-client` for programmatic stock research.

## Quick Start

```typescript
import { RobinhoodClient } from "@investwithtaji/rh-client";

const client = new RobinhoodClient();
await client.restoreSession();

const [quotes, fundamentals] = await Promise.all([
  client.getQuotes("AAPL"),
  client.getFundamentals("AAPL"),
]);
console.log(`AAPL: $${quotes[0]?.last_trade_price} | P/E: ${quotes[0]?.pe_ratio}`);
```

## MCP Tool → Client Method Mapping

| MCP Tool | Client Method |
|----------|--------------|
| `robinhood_get_stock_quote` | `getQuotes(symbols)` + `getFundamentals(symbols)` |
| `robinhood_get_news` | `getNews(symbol)` + `getRatings(symbol)` + `getEarnings(symbol)` |
| `robinhood_get_historicals` | `getStockHistoricals(symbols, opts?)` |
| `robinhood_search` | `findInstruments(query)` |

## Methods

### `getQuotes(symbols): Promise<Quote[]>`

Accepts a single symbol or array. Returns quotes with `last_trade_price`, `bid_price`, `ask_price`, `previous_close`, `pe_ratio`.

```typescript
const quotes = await client.getQuotes(["AAPL", "MSFT"]);
```

### `getFundamentals(symbols): Promise<Fundamental[]>`

Returns `market_cap`, `pe_ratio`, `dividend_yield`, `high_52_weeks`, `low_52_weeks`, `description`, `ceo`, `sector`.

```typescript
const fundamentals = await client.getFundamentals("AAPL");
```

### `getStockHistoricals(symbols, opts?): Promise<StockHistorical[]>`

Returns OHLCV data per symbol.

```typescript
const historicals = await client.getStockHistoricals("AAPL", {
  interval: "day",   // "5minute" | "10minute" | "hour" | "day" | "week"
  span: "year",      // "day" | "week" | "month" | "3month" | "year" | "5year"
  bounds: "regular", // "regular" | "extended" | "trading"
});
// => [{ symbol, historicals: [{ begins_at, open_price, close_price, high_price, low_price, volume }] }]
```

### `getNews(symbol): Promise<News[]>`

```typescript
const news = await client.getNews("AAPL");
// => [{ title, url, source, published_at, summary, ... }]
```

### `getRatings(symbol): Promise<Rating>`

```typescript
const ratings = await client.getRatings("AAPL");
// => { summary: { num_buy_ratings, num_hold_ratings, num_sell_ratings }, ratings: [...] }
```

### `getEarnings(symbol): Promise<Earnings[]>`

```typescript
const earnings = await client.getEarnings("AAPL");
// => [{ year, quarter, eps: { estimate, actual }, ... }]
```

### `findInstruments(query): Promise<Instrument[]>`

Search by keyword. Returns instrument metadata.

```typescript
const results = await client.findInstruments("artificial intelligence");
```
