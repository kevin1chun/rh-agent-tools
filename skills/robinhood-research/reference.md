# Stock Research MCP Tools Reference

## robinhood_get_stock_quote
Get quote and fundamentals for one or more stock tickers.

**Parameters:**
- `symbols` (string, required) — comma-separated tickers, e.g. "AAPL" or "AAPL,MSFT,GOOGL"

**Response:**
```json
{
  "AAPL": {
    "quote": {
      "symbol": "AAPL",
      "last_trade_price": "150.00",
      "ask_price": "150.10",
      "bid_price": "149.90",
      "previous_close": "148.00",
      "adjusted_previous_close": "148.00",
      "pe_ratio": "25.5",
      "last_extended_hours_trade_price": "150.50"
    },
    "fundamentals": {
      "symbol": "AAPL",
      "market_cap": "2500000000000",
      "pe_ratio": "25.5",
      "dividend_yield": "0.55",
      "high_52_weeks": "180.00",
      "low_52_weeks": "120.00"
    }
  }
}
```

## robinhood_get_news
Get news, analyst ratings, and earnings for a stock symbol.

**Parameters:**
- `symbol` (string, required) — stock ticker

**Response:**
```json
{
  "news": [{ "title": "...", "source": "...", "published_at": "...", "url": "..." }],
  "ratings": {
    "summary": { "num_buy_ratings": 20, "num_hold_ratings": 5, "num_sell_ratings": 2 },
    "ratings": [...]
  },
  "earnings": [{
    "symbol": "AAPL",
    "year": 2025,
    "quarter": 1,
    "eps": { "estimate": "1.50", "actual": "1.55" }
  }]
}
```

## robinhood_get_historicals
Get OHLCV price history for one or more stock tickers.

**Parameters:**
- `symbols` (string, required) — comma-separated tickers
- `interval` (enum: "5minute", "10minute", "hour", "day", "week", default: "day")
- `span` (enum: "day", "week", "month", "3month", "year", "5year", default: "month")
- `bounds` (enum: "regular", "extended", "trading", default: "regular")

**Response:**
```json
{
  "historicals": [{
    "symbol": "AAPL",
    "historicals": [{
      "begins_at": "2024-01-02T00:00:00Z",
      "open_price": "148.00",
      "close_price": "150.00",
      "high_price": "151.00",
      "low_price": "147.50",
      "volume": 50000000
    }]
  }]
}
```

## robinhood_search
Search stocks by keyword or browse by market category tag.

**Parameters:**
- `query` (string, required) — search keyword (ignored if tag provided)
- `tag` (string, optional) — market category tag (e.g., "technology", "most-popular-under-25")

**Response:**
```json
{
  "results": [{
    "url": "...",
    "id": "instrument-uuid",
    "symbol": "AAPL",
    "name": "Apple Inc",
    "simple_name": "Apple",
    "type": "stock"
  }]
}
```
