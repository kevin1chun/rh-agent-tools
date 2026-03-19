# Trade — Order Placement & Management

**CRITICAL: Safety rules in SKILL.md apply to ALL operations below. Always confirm with the user before placing any order.**

## Order Flow

### Step 1: Resolve Account
```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
const accounts = await rh.getAccounts();
console.log(JSON.stringify(accounts, null, 2));
'
```
If multiple accounts, **ask the user which account to use**. Never pick on their behalf.

### Step 2: Parse the Request
Extract from the user's message:
- Symbol (e.g., AAPL, BTC)
- Side (buy/sell)
- Quantity or dollar amount
- Order type (market/limit/stop) and prices
- Asset type (stock/option/crypto)

### Step 3: Show Confirmation
Get current price, then present an order preview:
```
Order Preview:
  Action: BUY 10 shares of AAPL
  Type: Market order
  Current price: $150.00
  Estimated cost: ~$1,500.00
  Account: <account_number>

Proceed? (yes/no)
```
Wait for the user to explicitly confirm.

### Step 4: Place Order (after user confirms)

## Stock Orders

```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
const order = await rh.orderStock("AAPL", 10, "buy", { limitPrice: 150.0, accountNumber: "ACCT" });
console.log(JSON.stringify(order, null, 2));
'
```

Options: `{ limitPrice, stopPrice, trailAmount, trailType, accountNumber, timeInForce, extendedHours }`

- Market order: omit `limitPrice` and `stopPrice`
- Limit order: set `limitPrice`
- Stop-limit: set both `stopPrice` and `limitPrice`
- Trailing stop: set `trailAmount` + `trailType` ("percentage" or "price")

## Option Orders

```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
const order = await rh.orderOption("AAPL", [
  { expirationDate: "2026-04-17", strike: 200, optionType: "call", side: "buy", positionEffect: "open" }
], 3.50, 1, "debit", { accountNumber: "ACCT" });
console.log(JSON.stringify(order, null, 2));
'
```

For spreads, pass multiple legs. `direction` is "debit" for net-buy, "credit" for net-sell.

## Crypto Orders

```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
// Buy 0.5 BTC
const order = await rh.orderCrypto("BTC", "buy", 0.5);
// Buy $100 of BTC
const order2 = await rh.orderCrypto("BTC", "buy", 100, { amountIn: "price" });
console.log(JSON.stringify(order, null, 2));
'
```

Options: `{ amountIn?: "quantity" | "price"; limitPrice?: number }`

## Order Management

### View Orders
```typescript
const allOrders = await rh.getAllStockOrders();
const openOrders = await rh.getOpenStockOrders();
// Also: getAllOptionOrders(), getOpenOptionOrders(), getAllCryptoOrders(), getOpenCryptoOrders()
```

### Cancel Order
```typescript
await rh.cancelStockOrder("order-uuid");
// Also: cancelOptionOrder(), cancelCryptoOrder()
```

### Monitor Order
```typescript
const order = await rh.getStockOrder("order-uuid");
// Also: getOptionOrder(), getCryptoOrder()
```

For all client methods, see [client-api.md](client-api.md).
