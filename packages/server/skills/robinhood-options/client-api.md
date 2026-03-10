# Options — Client API

TypeScript methods from `@rh-for-agents/client` for programmatic options analysis.

## Quick Start

```typescript
import { RobinhoodClient } from "@rh-for-agents/client";

const client = new RobinhoodClient();
await client.restoreSession();

const chain = await client.getChains("AAPL");
console.log("Expirations:", chain.expiration_dates);

const options = await client.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17",
  optionType: "call",
});
```

## MCP Tool → Client Method Mapping

| MCP Tool | Client Method |
|----------|--------------|
| `robinhood_get_options` (chain) | `getChains(symbol)` |
| `robinhood_get_options` (instruments) | `findTradableOptions(symbol, opts?)` |
| `robinhood_get_options` (greeks) | `getOptionMarketData(symbol, expDate, strike, type)` |
| `robinhood_get_orders` (options) | `getOpenOptionPositions(accountNumber?)` |
| `robinhood_place_option_order` | `orderOption(...)` |

## Methods

### `getChains(symbol): Promise<OptionChain>`

Returns chain metadata including all available expiration dates.

```typescript
const chain = await client.getChains("AAPL");
// => { id, expiration_dates: ["2026-04-17", ...], ... }
```

### `findTradableOptions(symbol, opts?): Promise<OptionInstrument[]>`

Returns tradable option instruments filtered by expiration, strike, and type.

```typescript
// All options for an expiration
const options = await client.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17",
});

// Specific strike + type
const calls = await client.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17",
  strikePrice: 200,
  optionType: "call",
});
```

Options: `{ expirationDate?: string; strikePrice?: number; optionType?: "call" | "put" }`

### `getOptionMarketData(symbol, expirationDate, strikePrice, optionType): Promise<OptionMarketData[]>`

Returns greeks and pricing for a specific option. Requires all four parameters.

```typescript
const data = await client.getOptionMarketData("AAPL", "2026-04-17", 200, "call");
// => [{ adjusted_mark_price, delta, gamma, theta, vega, implied_volatility, open_interest, volume, ... }]
```

### `getOpenOptionPositions(accountNumber?): Promise<OptionPosition[]>`

```typescript
const positions = await client.getOpenOptionPositions();
```

### `orderOption(symbol, quantity, side, expirationDate, strikePrice, optionType, positionEffect, price, opts?): Promise<OptionOrder>`

```typescript
// Buy to open a call
await client.orderOption("AAPL", 1, "buy", "2026-04-17", 200, "call", "open", 3.50);

// Sell to close
await client.orderOption("AAPL", 1, "sell", "2026-04-17", 200, "call", "close", 4.00, {
  direction: "credit",
});
```
