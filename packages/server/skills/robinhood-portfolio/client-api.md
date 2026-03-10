# Portfolio — Client API

TypeScript methods from `@investwithtaji/rh-client` for programmatic portfolio access.

## Quick Start

```typescript
import { RobinhoodClient } from "@investwithtaji/rh-client";

const client = new RobinhoodClient();
await client.restoreSession();

const holdings = await client.buildHoldings();
for (const [symbol, h] of Object.entries(holdings)) {
  console.log(`${symbol}: ${h.quantity} shares @ $${h.price} (P&L: ${h.percent_change}%)`);
}
```

## MCP Tool → Client Method Mapping

| MCP Tool | Client Method |
|----------|--------------|
| `robinhood_get_portfolio` | `buildHoldings(opts?)` |
| `robinhood_get_accounts` | `getAccounts(opts?)` |
| `robinhood_get_account` | `getAccountProfile(accountNumber?)` |
| `robinhood_get_crypto` (positions) | `getCryptoPositions()` |
| `robinhood_get_crypto` (quote) | `getCryptoQuote(symbol)` |

## Methods

### `buildHoldings(opts?): Promise<Record<string, Holding>>`

Aggregates positions, quotes, and optionally dividends into a single holdings map.

```typescript
const holdings = await client.buildHoldings({ withDividends: true });
// => { "AAPL": { price, quantity, average_buy_price, equity, percent_change, name, ... } }
```

Options: `{ accountNumber?: string; withDividends?: boolean }`

### `getAccounts(opts?): Promise<Account[]>`

Returns all brokerage accounts.

```typescript
const accounts = await client.getAccounts();
// => [{ account_number, type, url, ... }]
```

### `getPortfolioProfile(accountNumber?): Promise<Portfolio>`

Returns portfolio-level aggregates.

```typescript
const portfolio = await client.getPortfolioProfile();
// => { equity, market_value, ... }
```

### `getCryptoPositions(): Promise<CryptoPosition[]>`

```typescript
const positions = await client.getCryptoPositions();
```

### `getCryptoQuote(symbol): Promise<CryptoQuote>`

```typescript
const btc = await client.getCryptoQuote("BTC");
// => { mark_price, ask_price, bid_price, symbol, ... }
```
