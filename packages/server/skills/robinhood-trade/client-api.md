# Trade — Client API

TypeScript methods from `@rh-for-agents/client` for programmatic order management.

**Safety**: Always confirm with the user before calling order methods.

## Quick Start

```typescript
import { RobinhoodClient } from "@rh-for-agents/client";

const client = new RobinhoodClient();
await client.restoreSession();

// Limit buy
const order = await client.orderStock("AAPL", 10, "buy", { limitPrice: 150.0 });
console.log(`Order ${order.id}: ${order.state}`);
```

## MCP Tool → Client Method Mapping

| MCP Tool | Client Method |
|----------|--------------|
| `robinhood_place_stock_order` | `orderStock(symbol, quantity, side, opts?)` |
| `robinhood_place_option_order` | `orderOption(symbol, quantity, side, ...)` |
| `robinhood_place_crypto_order` | `orderCrypto(symbol, side, amount, opts?)` |
| `robinhood_get_orders` (stock) | `getAllStockOrders()` / `getOpenStockOrders()` |
| `robinhood_get_orders` (option) | `getAllOptionOrders()` / `getOpenOptionOrders()` |
| `robinhood_get_orders` (crypto) | `getAllCryptoOrders()` / `getOpenCryptoOrders()` |
| `robinhood_cancel_order` | `cancelStockOrder(id)` / `cancelOptionOrder(id)` / `cancelCryptoOrder(id)` |
| `robinhood_get_order_status` | `getStockOrder(id)` / `getOptionOrder(id)` / `getCryptoOrder(id)` |

## Methods

### `orderStock(symbol, quantity, side, opts?): Promise<StockOrder>`

```typescript
// Market buy
await client.orderStock("AAPL", 10, "buy");

// Limit buy
await client.orderStock("AAPL", 10, "buy", { limitPrice: 150.0 });

// Stop-limit sell
await client.orderStock("AAPL", 10, "sell", { stopPrice: 145.0, limitPrice: 144.0 });

// Trailing stop (percentage)
await client.orderStock("AAPL", 10, "sell", { trailAmount: 5, trailType: "percentage" });
```

Options:
- `limitPrice?: number` — limit orders
- `stopPrice?: number` — stop/stop-limit orders
- `trailAmount?: number` + `trailType?: "percentage" | "price"` — trailing stops
- `accountNumber?: string` — multi-account
- `timeInForce?: "gtc" | "gfd"` — defaults to `"gtc"`
- `extendedHours?: boolean`

### `orderOption(symbol, quantity, side, expirationDate, strikePrice, optionType, positionEffect, price, opts?): Promise<OptionOrder>`

```typescript
await client.orderOption("AAPL", 1, "buy", "2026-04-17", 200, "call", "open", 3.50);
```

### `orderCrypto(symbol, side, quantityOrPrice, opts?): Promise<CryptoOrder>`

```typescript
// Buy 0.5 BTC
await client.orderCrypto("BTC", "buy", 0.5);

// Buy $100 of BTC
await client.orderCrypto("BTC", "buy", 100, { amountIn: "price" });

// Limit buy
await client.orderCrypto("BTC", "buy", 0.5, { limitPrice: 60000 });
```

Options: `{ amountIn?: "quantity" | "price"; limitPrice?: number; timeInForce?: string }`

### Order Queries

```typescript
const allOrders = await client.getAllStockOrders();
const openOrders = await client.getOpenStockOrders();
const order = await client.getStockOrder("order-uuid");
```

### Cancel Orders

```typescript
await client.cancelStockOrder("order-uuid");
await client.cancelOptionOrder("order-uuid");
await client.cancelCryptoOrder("order-uuid");
```
