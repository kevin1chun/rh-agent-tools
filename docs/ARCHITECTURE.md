# rh-for-agents — Architecture & Design

## Context

`robin_stocks` (the pip library) is unmaintained. `load_phoenix_account()` is broken (`phoenix.robinhood.com` rejects TLS), multi-account requires raw HTTP calls that bypass the library, and `input()` calls block non-interactive environments. We replaced it with a custom TypeScript client purpose-built for AI agents.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Claude                            │
│                                                                 │
│   "show my portfolio"          robinhood_get_portfolio(...)     │
│          │                              │                       │
│          ▼                              ▼                       │
│   ┌─────────────┐              ┌──────────────┐                 │
│   │   Skills    │              │  MCP Tools   │                 │
│   │ (SKILL.md)  │              │ (JSON-RPC)   │                 │
│   └──────┬──────┘              └──────┬───────┘                 │
│          │                            │                         │
│          │  RobinhoodClient()         │  getClient() singleton  │
│          │  .restoreSession()        │  getAuthenticatedRh()   │
│          │  .getPositions()           │                         │
│          ▼                            ▼                         │
│   ┌───────────────────────────────────────────┐                 │
│   │      packages/client/src/                 │                 │
│   │      @rh-for-agents/client               │                 │
│   │  ┌─────────────────────────────────────┐  │                 │
│   │  │  session: RobinhoodSession (fetch)  │  │                 │
│   │  │  loggedIn: boolean                  │  │                 │
│   │  │                                     │  │                 │
│   │  │  auth.ts  ──► token-store (AES-GCM) │  │                 │
│   │  │  http.ts  ──► get/post/delete+paging│  │                 │
│   │  │  urls.ts  ──► pure endpoint builders│  │                 │
│   │  └─────────────────────────────────────┘  │                 │
│   └──────────────────┬────────────────────────┘                 │
│                      │                                          │
│                      ▼                                          │
│            api.robinhood.com                                    │
│            nummus.robinhood.com (crypto)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Bun workspace monorepo.** `packages/client/` is a standalone API client. `packages/server/` is the MCP server that wraps it.

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **Bun** | Native TS execution, fast startup, built-in fetch |
| **ESM-only** | Bun is ESM-native, no CJS needed |
| **@modelcontextprotocol/sdk** | Official MCP SDK, StdioServerTransport for agent compatibility |
| **Zod v3.24** | Runtime validation of API responses + MCP tool parameter schemas |
| **Vitest** | Fast TS-native testing, correct module isolation via `vi.mock()` |
| **Biome v2** | All-in-one lint + format, 10-25x faster than ESLint |
| **AES-256-GCM** | Modern authenticated encryption for token storage |
| **playwright-core** | Browser auth via system Chrome, no bundled browser (~1MB) |
| **keytar** | OS keychain access (optional dependency, dynamic import) |

## File Map

```
packages/client/src/          <- @rh-for-agents/client
├── index.ts                  <- Exports: RobinhoodClient, getClient(), login()
├── client.ts                 <- RobinhoodClient class (~50 async methods)
├── auth.ts                   <- Session restore + token refresh
├── token-store.ts            <- AES-256-GCM encrypted JSON + OS keychain key
├── session.ts                <- fetch wrapper (headers, timeouts, auth)
├── http.ts                   <- GET/POST/DELETE with pagination + error mapping
├── urls.ts                   <- Pure URL builders (api.robinhood.com, nummus.robinhood.com)
├── errors.ts                 <- Exception hierarchy
├── types.ts                  <- Zod schemas + inferred types
└── branded.ts                <- AccountNumber, OrderId, etc. branded types

packages/server/src/           <- rh-for-agents MCP server
├── index.ts                   <- main() export, StdioServerTransport
├── server.ts                  <- McpServer creation + tool registration
├── browser-auth.ts            <- Playwright browser login capture
└── tools/
    ├── auth.ts               <- robinhood_browser_login, robinhood_check_session
    ├── portfolio.ts          <- robinhood_get_portfolio, _get_accounts, _get_account
    ├── stocks.ts             <- robinhood_get_stock_quote, _get_historicals, _get_news, _search
    ├── options.ts            <- robinhood_get_options
    ├── crypto.ts             <- robinhood_get_crypto
    ├── orders.ts             <- robinhood_place_stock_order, _option, _crypto, _cancel, _get_orders
    └── markets.ts            <- robinhood_get_movers

.claude/skills/
├── robinhood-setup/          <- Interactive login (SKILL.md)
├── robinhood-portfolio/      <- Multi-account portfolio display
├── robinhood-research/       <- Stock research report
├── robinhood-trade/          <- Order placement with confirmation
└── robinhood-options/        <- Options chain scanner
```

## Authentication

### Token Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│                restoreSession() called                    │
│                          │                                │
│                          ▼                                │
│              loadTokens()                                 │
│    ~/.rh-for-agents/session.enc                          │
│              │                                            │
│              ├─── AES-256-GCM decrypt                     │
│              │    (key from OS keychain via keytar)        │
│              │                                            │
│              ▼                                            │
│     Set Authorization header                              │
│     Validate: GET /positions/                             │
│              │                                            │
│         ┌────┴────┐                                       │
│       Valid?    Invalid?                                  │
│         │         │                                       │
│    return      ┌──┘                                       │
│   "cached"     │                                          │
│                ▼                                          │
│      POST /oauth2/token/                                  │
│      (refresh_token)                                      │
│                │                                          │
│         ┌──────┴──────┐                                   │
│       Success?      Failure?                              │
│         │              │                                  │
│    saveTokens()     throw                                 │
│    return          AuthenticationError                    │
│   "refreshed"      ("Use robinhood_browser_login")       │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Encrypted Token Storage

```
┌─ token-store.ts ──────────────────────────────────┐
│                                                    │
│  Data (JSON):                                      │
│  {access_token, refresh_token, token_type,         │
│   device_token, account_hint, saved_at}            │
│         │                                          │
│         ▼                                          │
│  AES-256-GCM encrypt(json_bytes)                   │
│  Format: [iv (12)] [tag (16)] [ciphertext]         │
│         │                                          │
│         ▼                                          │
│  ~/.rh-for-agents/session.enc  (0o600)            │
│                                                    │
│  Key: OS Keychain (via keytar)                     │
│  ├── service: "rh-for-agents"                     │
│  └── username: "encryption-key"                    │
│  Generated once via randomBytes(32)                │
│  Never on filesystem.                              │
│                                                    │
│  Fallback: plaintext JSON if keytar unavailable    │
│  (CI environments, minimal installs)               │
└────────────────────────────────────────────────────┘
```

`keytar` is an optional dependency (dynamic import). Without it, tokens are stored as plaintext JSON with a console warning.

## HTTP Layer

### Request Pipeline

```
client.get(url, { dataType: "pagination", params: {...} })
    │
    ▼
http.requestGet(session, url, { dataType, params })
    │
    ▼
session.get(url, params)                <- native fetch
    │
    ├── Headers: Accept, Content-Type, X-Robinhood-API-Version: 1.431.4
    ├── Auth: Bearer {access_token}
    ├── Timeout: AbortSignal.timeout(16000)
    │
    ▼
raiseForStatus(response)
    ├── 404 -> NotFoundError
    ├── 429 -> RateLimitError
    └── other non-2xx -> APIError(statusCode, responseBody)
    │
    ▼
dataType processing:
    ├── "regular"    -> return response.json()
    ├── "results"    -> return data.results
    ├── "indexzero"  -> return data.results[0]
    └── "pagination" -> follow data.next links, accumulate all results
```

### Exception Hierarchy

```
RobinhoodError
├── AuthenticationError
│   └── TokenExpiredError
├── NotLoggedInError
└── APIError  (.statusCode, .responseBody)
    ├── RateLimitError
    └── NotFoundError
```

Every error carries context. No silent `undefined` returns.

## Multi-Account

Standard Robinhood `/accounts/` only returns the default APEX account. We always pass:

```typescript
const MULTI_ACCOUNT_PARAMS = {
  default_to_all_accounts: "true",
  include_managed: "true",
  include_multiple_individual: "true",
};
```

Every account-scoped method accepts `accountNumber?: string`:
- `getPositions({ accountNumber })` — positions for specific account
- `orderStock(..., { accountNumber })` — place order on specific account
- `buildHoldings({ accountNumber })` — P&L for specific account
- Omitted → default account

## MCP Tools (18 total)

```
┌──────────────────────────────────────────────────────┐
│  MCP Tool                    Client Methods Wrapped  │
├──────────────────────────────────────────────────────┤
│  robinhood_browser_login     (Playwright browser)    │
│  robinhood_check_session     restoreSession()        │
│  robinhood_get_portfolio     buildHoldings()         │
│                              getAccountProfile()     │
│                              getPortfolioProfile()   │
│  robinhood_get_accounts      getAccounts()           │
│  robinhood_get_account       getAccountProfile()     │
│                              getUserProfile()        │
│                              getInvestmentProfile()  │
│  robinhood_get_stock_quote   getQuotes()             │
│                              getFundamentals()       │
│  robinhood_get_historicals   getStockHistoricals()   │
│  robinhood_get_news          getNews()               │
│  robinhood_search            findInstruments()       │
│  robinhood_get_options       getChains()             │
│                              findTradableOptions()   │
│                              getOptionMarketData()   │
│  robinhood_get_crypto        getCryptoQuote()        │
│                              getCryptoHistoricals()  │
│                              getCryptoPositions()    │
│  robinhood_get_orders        getAllStockOrders()      │
│                              getOpenStockOrders()    │
│                              (+ option, crypto)      │
│  robinhood_place_stock_order orderStock()            │
│  robinhood_place_option_order orderOption()          │
│  robinhood_place_crypto_order orderCrypto()          │
│  robinhood_cancel_order      cancelStockOrder()      │
│                              cancelOptionOrder()     │
│                              cancelCryptoOrder()     │
│  robinhood_get_order_status  getStockOrder()         │
│                              getOptionOrder()        │
│                              getCryptoOrder()        │
│  robinhood_get_movers        getTopMovers()          │
│                              getTopMoversSp500()     │
│                              getTop100()             │
└──────────────────────────────────────────────────────┘
```

Each tool accesses the client via `getClient()` singleton.

## Order Placement

### Order Type Resolution

`orderStock()` determines type from which price parameters are set:

```
Parameters present          -> (orderType, trigger)
─────────────────────────────────────────────────
trailAmount                 -> ("market", "stop")      trailing stop
stopPrice + limitPrice      -> ("limit",  "stop")      stop-limit
stopPrice only              -> ("market", "stop")      stop-loss
limitPrice only             -> ("limit",  "immediate") limit
none                        -> ("market", "immediate") market
```

Market buy orders include a 5% price collar (`preset_percent_limit: "0.05"`).

### Safety Model

```
┌─────────────┬──────────────────────────────────────────┐
│   Tier      │  Operations                              │
├─────────────┼──────────────────────────────────────────┤
│  Allowed    │  All read operations (quotes, positions, │
│             │  orders, historicals, news, options)      │
├─────────────┼──────────────────────────────────────────┤
│  Guarded    │  Order placement — requires explicit     │
│             │  parameters, no dangerous defaults.      │
│             │  Claude must confirm with user first.    │
├─────────────┼──────────────────────────────────────────┤
│  Blocked    │  Fund transfers, bank operations,        │
│             │  bulk cancel (cancelAll*)                 │
│             │  These functions do not exist in client. │
└─────────────┴──────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Why |
|---|---|
| **Bun + native fetch** | Zero deps for HTTP, native TS execution, fast startup |
| **Class-based over module globals** | Instance-scoped session prevents shared mutable state. Testable. |
| **AES-256-GCM over Fernet** | Modern authenticated encryption via `node:crypto`. No external deps. |
| **Keychain via keytar** | Key never touches disk. macOS Keychain is hardware-backed. |
| **Optional keytar (dynamic import)** | Avoids blocking CI/test environments |
| **No phoenix.robinhood.com** | TLS handshake fails. `api.robinhood.com` has equivalent data. |
| **Unified order methods** | `orderStock()` with optional params vs 10 separate `orderBuyMarket()` etc. |
| **Vitest over bun test** | Proper module isolation via worker processes. Critical for mocking. |
| **Zod schemas** | Runtime validation of all API responses — Python version lacked this. |
| **ESM-only** | Bun is ESM-native, no CJS compatibility needed. |
