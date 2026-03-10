---
name: robinhood-research
description: Research and analyze stocks using Robinhood data. Use when user asks to research, analyze, or get info about a specific stock.
allowed-tools: mcp__rh-for-agents__*
---

# robinhood-research

Research and analyze stocks using Robinhood data.

## Triggers
- "research AAPL"
- "analyze this stock"
- "due diligence on TSLA"
- "tell me about NVDA"
- "stock analysis"
- "what do you think about [ticker]"

## Instructions

### Step 1: Fetch Data
Call these MCP tools in parallel:

1. **`rh-for-agents:robinhood_get_stock_quote`** with `symbols: "AAPL"` — returns quote + fundamentals
2. **`rh-for-agents:robinhood_get_news`** with `symbol: "AAPL"` — returns news, analyst ratings, and earnings
3. **`rh-for-agents:robinhood_get_historicals`** with `symbols: "AAPL", interval: "day", span: "year"` — OHLCV price history

### Key Data Fields
- **Quote**: `last_trade_price`, `bid_price`, `ask_price`, `previous_close`, `pe_ratio`
- **Fundamentals**: `market_cap`, `pe_ratio`, `dividend_yield`, `high_52_weeks`, `low_52_weeks`, `description`, `ceo`, `sector`
- **Ratings**: `summary.num_buy_ratings`, `summary.num_hold_ratings`, `summary.num_sell_ratings`
- **Earnings**: `eps.estimate`, `eps.actual`, `year`, `quarter`
- **Historicals**: Array of `{ begins_at, open_price, close_price, high_price, low_price, volume }`

### Output Structure
1. **Company Overview**: Name, sector, industry, market cap, description
2. **Price Data**: Current price, 52-week range, position within range
3. **Valuation**: P/E ratio, dividend yield
4. **Analyst Ratings**: Buy/Hold/Sell consensus
5. **Recent Earnings**: Last 4 quarters EPS (estimate vs actual)
6. **News**: Top 5 recent headlines
7. **Price Trend**: Summary of recent price action from historicals

## Programmatic Access
For TypeScript scripts using `@investwithtaji/rh-client`, see [client-api.md](client-api.md).

## MCP Tools Used
| Tool | Purpose |
|------|---------|
| `rh-for-agents:robinhood_get_stock_quote` | Quote + fundamentals |
| `rh-for-agents:robinhood_get_news` | News, ratings, earnings |
| `rh-for-agents:robinhood_get_historicals` | OHLCV price history |
| `rh-for-agents:robinhood_search` | Find instruments by keyword |
