# @rh-for-agents/client

TypeScript Robinhood API client for AI-native trading interfaces.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+ (required runtime — `.ts` exports, no build step)

## Installation

```bash
bun add @rh-for-agents/client
```

## Usage

```typescript
import { RobinhoodClient } from "@rh-for-agents/client";

const client = new RobinhoodClient();
await client.restoreSession(); // restores cached session or throws

const quotes = await client.getQuotes(["AAPL", "MSFT"]);
const holdings = await client.buildHoldings();
const portfolio = await client.getPortfolioProfile();
```

### Singleton

```typescript
import { getClient } from "@rh-for-agents/client";

const rh = getClient(); // returns shared instance
await rh.restoreSession();
```

## Error Handling

All errors extend `RobinhoodError`:

```typescript
import {
  AuthenticationError,
  TokenExpiredError,
  NotLoggedInError,
  APIError,
  NotFoundError,
  RateLimitError,
} from "@rh-for-agents/client";

try {
  await client.getQuotes(["AAPL"]);
} catch (err) {
  if (err instanceof TokenExpiredError) {
    // re-authenticate
  } else if (err instanceof NotFoundError) {
    // instrument/pair not found
  } else if (err instanceof RateLimitError) {
    // back off and retry
  }
}
```

## Multi-Account

Every account-scoped method accepts an optional `accountNumber`:

```typescript
const holdings = await client.buildHoldings({ accountNumber: "ABC123" });
const orders = await client.getAllStockOrders({ accountNumber: "ABC123" });
```

## Session & Security

- Sessions are cached to `~/.rh-for-agents/session.enc` (AES-256-GCM, key in OS keychain via `keytar`)
- `restoreSession()` decrypts and validates the cached token
- Tokens expire after ~24 hours; re-authenticate via the MCP server's `robinhood_browser_login` tool
- **Never** store tokens in plaintext or commit `session.enc`

## Full Documentation

See the [root README](../../README.md) for MCP server setup, agent compatibility, and safety rules.
