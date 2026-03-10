---
name: robinhood-trade
description: Place, monitor, and cancel Robinhood orders. Use when user wants to buy, sell, or manage orders.
allowed-tools: mcp__rh-for-agents__*
---

# robinhood-trade

Place, monitor, and cancel stock/option/crypto orders.

## Triggers
- "buy 10 shares of AAPL"
- "sell my TSLA position"
- "place a limit order"
- "cancel my open order"
- "show my open orders"
- "buy $100 of BTC"

## Instructions

### CRITICAL SAFETY RULES
1. **Always confirm before placing any order** — show the user what will be ordered and get explicit "yes"
2. **Show current price** before order confirmation so user knows the cost
3. **Never place orders without user confirmation**
4. **Fund transfers and bank operations are BLOCKED** — refuse these requests
5. **Never place bulk cancel operations** — cancel orders one at a time

### Order Flow

#### Step 1: Parse the Request
Extract from the user's message:
- Symbol (e.g., AAPL, BTC)
- Side (buy/sell)
- Quantity or dollar amount
- Order type (market/limit/stop) and prices
- Asset type (stock/option/crypto)

#### Step 2: Show Confirmation
Get current price via `rh-for-agents:robinhood_get_stock_quote` (or `rh-for-agents:robinhood_get_crypto` for crypto), then present an order preview:
```
Order Preview:
  Action: BUY 10 shares of AAPL
  Type: Market order
  Current price: $150.00
  Estimated cost: ~$1,500.00
  Account: default

Proceed? (yes/no)
```
Wait for the user to explicitly confirm.

#### Step 3: Place Order (after user confirms)

### Stock Orders
Use `rh-for-agents:robinhood_place_stock_order` with parameters:
- `symbol`, `side` ("buy"/"sell"), `quantity`
- `order_type`: "market", "limit", "stop", "stop_limit", "trailing_stop"
- `limit_price`: for limit/stop_limit orders
- `stop_price`: for stop/stop_limit orders
- `trail_amount` + `trail_type`: for trailing_stop orders
- `account_number`: optional, for multi-account
- `time_in_force`: "gtc" (default) or "gfd"
- `extended_hours`: boolean

### Option Orders
Use `rh-for-agents:robinhood_place_option_order` with parameters:
- `symbol`, `expiration_date`, `strike`, `option_type` ("call"/"put")
- `side` ("buy"/"sell"), `position_effect` ("open"/"close")
- `quantity`, `price` (limit price per contract)
- `direction` ("debit"/"credit")

### Crypto Orders
Use `rh-for-agents:robinhood_place_crypto_order` with parameters:
- `symbol` (e.g., "BTC"), `side` ("buy"/"sell")
- `amount_or_quantity`: the number
- `amount_in`: "quantity" (crypto units) or "price" (dollars)
- `limit_price`: for limit orders

### Order Management
- **View orders**: `rh-for-agents:robinhood_get_orders` with `order_type` and `status` ("open"/"all")
- **Cancel order**: `rh-for-agents:robinhood_cancel_order` with `order_id` and `order_type`

### Order Monitoring
After placing an order, use `rh-for-agents:robinhood_get_order_status` with the `order_id` from the placement response to check fill status, timestamps, and current state.

## BLOCKED Operations (never use)
- Bulk cancel operations
- Fund transfers (withdraw/deposit)
- Bank unlinking

## Programmatic Access
For TypeScript scripts using `@rh-for-agents/client`, see [client-api.md](client-api.md).

## MCP Tools Used
| Tool | Purpose |
|------|---------|
| `rh-for-agents:robinhood_get_stock_quote` | Get current price for confirmation |
| `rh-for-agents:robinhood_get_crypto` | Get crypto price for confirmation |
| `rh-for-agents:robinhood_place_stock_order` | Place stock orders |
| `rh-for-agents:robinhood_place_option_order` | Place option orders |
| `rh-for-agents:robinhood_place_crypto_order` | Place crypto orders |
| `rh-for-agents:robinhood_get_orders` | View order history |
| `rh-for-agents:robinhood_cancel_order` | Cancel a specific order |
| `rh-for-agents:robinhood_get_order_status` | Check order fill status after placement |
