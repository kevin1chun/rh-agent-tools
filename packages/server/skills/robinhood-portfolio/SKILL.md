---
name: robinhood-portfolio
description: View Robinhood portfolio holdings, P&L, and account summary. Use when user asks about their portfolio, positions, or holdings.
allowed-tools: mcp__rh-for-agents__*
---

# robinhood-portfolio

View portfolio holdings, P&L, and account summary.

## Triggers
- "show my portfolio"
- "what are my holdings"
- "account summary"
- "how is my portfolio doing"
- "portfolio performance"
- "my positions"

## Instructions

### Step 1: Fetch Portfolio Data
Call these MCP tools:

1. **`rh-for-agents:robinhood_get_portfolio`** — returns holdings with P&L, account summary (equity, cash, buying power)
2. **`rh-for-agents:robinhood_get_accounts`** — returns all brokerage accounts for multi-account display
3. **`rh-for-agents:robinhood_get_crypto`** with `info_type: "positions"` — returns crypto holdings

### Step 2: Enrich (Optional)
For crypto positions, call `rh-for-agents:robinhood_get_crypto` with `info_type: "quote"` for each held crypto symbol to get current prices.

### Multi-Account Support
The user may have multiple accounts. `rh-for-agents:robinhood_get_accounts` returns all of them. To get portfolio for a specific account, pass `account_number` to `rh-for-agents:robinhood_get_portfolio`.

### Output Format
Present results as a formatted table showing:
- Account summary: account number, type, portfolio value, cash, buying power
- Per-holding: Symbol, Name, Shares, Price, Avg Cost, Equity, P&L %, Allocation %
- Separate sections for stocks and crypto
- Summary line: Total holdings value, day change

## Data Sources (from `rh-for-agents:robinhood_get_portfolio` response)
**`holdings`** — per ticker: `price`, `quantity`, `average_buy_price`, `equity`, `percent_change`, `intraday_percent_change`, `equity_change`, `name`

**`summary`**: `equity`, `market_value`, `cash`, `buying_power`, `crypto_buying_power`, `cash_available_for_withdrawal`

## Programmatic Access
For TypeScript scripts using `@investwithtaji/rh-client`, see [client-api.md](client-api.md).

## MCP Tools Used
| Tool | Purpose |
|------|---------|
| `rh-for-agents:robinhood_get_portfolio` | Holdings + P&L + account summary |
| `rh-for-agents:robinhood_get_accounts` | All account numbers and types |
| `rh-for-agents:robinhood_get_crypto` | Crypto positions and quotes |
