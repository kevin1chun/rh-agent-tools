# robinhood-for-agents -- Architecture & Design

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
│          │  .restoreSession()         │  getAuthenticatedRh()   │
│          │  .getPositions()           │                         │
│          ▼                            ▼                         │
│   ┌───────────────────────────────────────────┐                 │
│   │      TypeScript client (src/client/)      │                 │
│   │  ┌─────────────────────────────────────┐  │                 │
│   │  │  session: RobinhoodSession (fetch)  │  │                 │
│   │  │  auth.ts  ──► ensureProxy()         │  │                 │
│   │  │  http.ts  ──► get/post/delete+paging│  │                 │
│   │  │  urls.ts  ──► proxy-aware builders  │  │                 │
│   │  └─────────────────────────────────────┘  │                 │
│   └──────────────────┬────────────────────────┘                 │
│                      │                                          │
│   ┌───────────────────────────────────────────┐                 │
│   │      Python client (robinhood_agents)     │                 │
│   │  ┌─────────────────────────────────────┐  │                 │
│   │  │  session: Session (httpx)           │  │                 │
│   │  │  _auth.py ──► auto-discover proxy   │  │                 │
│   │  │  _http.py ──► get/post/delete+paging│  │                 │
│   │  │  _urls.py ──► proxy-aware builders  │  │                 │
│   │  └─────────────────────────────────────┘  │                 │
│   └──────────────────┬────────────────────────┘                 │
│                      │                                          │
│                      ▼                                          │
│   ┌───────────────────────────────────────────┐                 │
│   │      Auth Proxy (127.0.0.1:3100)          │                 │
│   │                                           │                 │
│   │  /rh/*     → api.robinhood.com            │                 │
│   │  /nummus/* → nummus.robinhood.com         │                 │
│   │                                           │                 │
│   │  Injects Bearer token from OS keychain    │                 │
│   │  Handles token refresh on 401             │                 │
│   │  Strips auth from responses               │                 │
│   └──────────────────┬────────────────────────┘                 │
│                      │                                          │
│                      ▼                                          │
│            api.robinhood.com                                    │
│            nummus.robinhood.com (crypto)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Polyglot monorepo.** `typescript/src/client/` is the TypeScript API client. `typescript/src/server/` is the MCP server that wraps it. `typescript/src/server/proxy.ts` is the auth proxy that sits between both clients and Robinhood APIs. `python/src/robinhood_agents/` is the Python API client (async-only, proxy-mediated).

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **Bun** | Native TS execution, fast startup, built-in fetch |
| **ESM-only** | Bun is ESM-native, no CJS needed |
| **@modelcontextprotocol/sdk** | Official MCP SDK, StdioServerTransport for agent compatibility |
| **Zod v3.24** | Runtime validation of API responses + MCP tool parameter schemas |
| **Vitest** | Fast TS-native testing, correct module isolation via `vi.mock()` |
| **Biome v2** | All-in-one lint + format, 10-25x faster than ESLint |
| **Bun.secrets** | OS keychain access (macOS Keychain Services, Linux libsecret) |
| **playwright-core** | Browser auth via system Chrome, no bundled browser (~1MB) |

## File Map

```
src/client/                    <- robinhood-for-agents client library
├── index.ts                   <- Exports: RobinhoodClient, getClient(), login()
├── client.ts                  <- RobinhoodClient class (~50 async methods)
├── auth.ts                    <- Proxy-based auth: ensureProxy() + /reload-tokens
├── token-store.ts             <- Token storage via OS keychain (Bun.secrets)
├── session.ts                 <- fetch wrapper (headers, timeouts, redirect safety)
├── http.ts                    <- GET/POST/DELETE with pagination + proxyRewrite
├── urls.ts                    <- Proxy-aware URL builders (configureProxy, getProxyUrl)
├── errors.ts                  <- Exception hierarchy
├── types.ts                   <- Zod schemas + inferred types
└── branded.ts                 <- AccountNumber, OrderId, etc. branded types

src/server/                    <- robinhood-for-agents MCP server + auth proxy
├── index.ts                   <- main() export, ensureProxy + StdioServerTransport
├── server.ts                  <- McpServer creation + tool registration
├── proxy.ts                   <- Auth proxy: token injection, refresh, routing
├── browser-auth.ts            <- Playwright browser login capture
├── cli/
│   ├── proxy-cmd.ts          <- CLI handler for `proxy` subcommand
│   ├── onboard.ts            <- Interactive setup TUI
│   ├── install-mcp.ts        <- Install MCP server config
│   └── install-skills.ts     <- Install Claude Code skills
└── tools/
    ├── auth.ts               <- robinhood_browser_login, robinhood_check_session
    ├── portfolio.ts          <- robinhood_get_portfolio, _get_accounts, _get_account
    ├── stocks.ts             <- robinhood_get_stock_quote, _get_historicals, _get_news, _search
    ├── options.ts            <- robinhood_get_options
    ├── crypto.ts             <- robinhood_get_crypto
    ├── orders.ts             <- robinhood_place_stock_order, _option, _crypto, _cancel, _get_orders
    └── markets.ts            <- robinhood_get_movers
```

## Authentication

### Auth Proxy Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  restoreSession()                                                       │
│  (every tool call)                                                      │
│          │                                                              │
│          ▼                                                              │
│  ensureProxy()                                                          │
│  ├── ROBINHOOD_API_PROXY set? → health-check, read ROBINHOOD_PROXY_TOKEN│
│  ├── Already running in-process? → reuse (token in memory)             │
│  ├── Port 3100 already listening? → adopt + read proxy token from      │
│  │                                  keychain                            │
│  └── Otherwise → startProxy(127.0.0.1:3100)                           │
│          │                                                              │
│          ▼                                                              │
│  configureProxy(url, token)                                             │
│  API_BASE = "http://127.0.0.1:3100/rh"                                │
│  NUMMUS_BASE = "http://127.0.0.1:3100/nummus"                         │
│          │                                                              │
│          ▼                                                              │
│  POST /reload-tokens (picks up browser login changes)                  │
│  return { status: "logged_in", method: "proxy" }                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Browser Login Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  robinhood_browser_login                                               │
│  (first-time / expired)                                                │
│          │                                                              │
│          ▼                                                              │
│  ┌───────────────────┐                                                  │
│  │ Playwright launches│                                                  │
│  │ system Chrome      │                                                  │
│  │ (headless: false)  │                                                  │
│  └────────┬──────────┘                                                  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────┐                                                  │
│  │ Navigate to        │                                                  │
│  │ robinhood.com/login│                                                  │
│  └────────┬──────────┘                                                  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────┐                                                  │
│  │ User logs in       │                                                  │
│  │ (email, password,  │                                                  │
│  │  MFA push/SMS)     │                                                  │
│  └────────┬──────────┘                                                  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────────────┐                                          │
│  │ Robinhood frontend calls   │                                          │
│  │ POST /oauth2/token         │                                          │
│  │                            │                                          │
│  │ Playwright intercepts:     │                                          │
│  │  request  → device_token   │                                          │
│  │  response → access_token,  │                                          │
│  │             refresh_token   │                                          │
│  └────────┬──────────────────┘                                          │
│           │                                                              │
│           ▼                                                              │
│  saveTokens() ──► token-store.ts                                        │
│           │       Bun.secrets.set() → OS keychain                       │
│           │       (tokens never written to disk)                        │
│           │                                                              │
│           ▼                                                              │
│  POST /reload-tokens on proxy ──► proxy picks up new tokens            │
│  Close browser                                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The browser login is **purely passive** -- Playwright never clicks buttons, fills forms, or predicts the login flow. It opens a real Chrome window, the user completes login entirely on their own (including whatever MFA Robinhood requires), and Playwright only intercepts the network traffic:

- `page.on("request")` captures `device_token` from POST body to `/oauth2/token`
- `page.on("response")` captures `access_token` + `refresh_token` from the 200 response

This design is resilient to Robinhood UI changes -- it doesn't depend on any DOM selectors, page structure, or login step ordering. `playwright-core` is used (not `playwright`) so no browser binary is bundled.

### Token Storage

```
┌─ token-store.ts ──────────────────────────────────────────────────┐
│                                                                    │
│  SAVE                                                              │
│  ────                                                              │
│  TokenData (JSON):                                                 │
│  {access_token, refresh_token, token_type, device_token, saved_at} │
│         │                                                          │
│         ▼                                                          │
│  JSON.stringify()                                                  │
│         │                                                          │
│         ▼                                                          │
│  Bun.secrets.set("robinhood-for-agents", "session-tokens", json)  │
│  → OS encrypts and stores in keychain                              │
│  → No file written to disk                                         │
│                                                                    │
│                                                                    │
│  LOAD                                                              │
│  ────                                                              │
│  Bun.secrets.get("robinhood-for-agents", "session-tokens")        │
│         │                                                          │
│         ▼                                                          │
│  JSON.parse() → TokenData                                          │
│                                                                    │
│                                                                    │
│  STORAGE                                                           │
│  ───────                                                           │
│  OS Keychain via Bun.secrets                                       │
│  ├── macOS: Keychain Services                                      │
│  ├── Linux: libsecret (GNOME Keyring, KWallet)                    │
│  └── Windows: Credential Manager                                   │
│                                                                    │
│  Keychain entries:                                                 │
│  ├── "session-tokens" — RH OAuth tokens (access, refresh, device) │
│  └── "proxy-token"    — proxy access control shared secret         │
│  Neither ever touches the filesystem.                              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

`Bun.secrets` stores tokens directly in the OS keychain -- no intermediate encryption layer needed since the keychain itself provides encryption, access control, and tamper resistance.

### Proxy Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Client: GET /rh/positions/?nonzero=true                               │
│          + X-Proxy-Token: <shared-secret>                              │
│         │                                                               │
│         ▼                                                               │
│  Proxy: validate X-Proxy-Token header (403 if missing/invalid)        │
│         │                                                               │
│         ▼                                                               │
│  Proxy: resolveUpstream("/rh/positions/")                              │
│         → { upstream: "https://api.robinhood.com", path: "/positions/"}│
│         │                                                               │
│         ▼                                                               │
│  Proxy: forwardRequest()                                               │
│         ├── Allowlist client headers (accept, content-type, user-agent) │
│         ├── Inject: Authorization: Bearer <access_token>               │
│         ├── Forward to: https://api.robinhood.com/positions/?nonzero=..│
│         │                                                               │
│         ▼                                                               │
│  Upstream response: 200 / 401                                          │
│         │                                                               │
│         ├── 200 → strip auth headers from response → return to client  │
│         │                                                               │
│         └── 401 → refreshTokens() → retry forwardRequest()            │
│                    ├── POST /oauth2/token/ (refresh_token grant)       │
│                    ├── Update state.tokens + saveTokens()              │
│                    └── Retry original request with new token           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

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
    ├── No auth header (proxy injects it)
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
    └── "pagination" -> proxyRewrite(next), follow links, accumulate results
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
- `getPositions({ accountNumber })` -- positions for specific account
- `orderStock(..., { accountNumber })` -- place order on specific account
- `buildHoldings({ accountNumber })` -- P&L for specific account
- Omitted -> default account

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
│  Guarded    │  Order placement -- requires explicit    │
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
| **Auth proxy** | Single point of token access. Client never touches tokens directly. Enables Docker isolation. |
| **Bun + native fetch** | Zero deps for HTTP, native TS execution, fast startup |
| **Class-based over module globals** | Instance-scoped session prevents shared mutable state. Testable. |
| **Bun.secrets for token storage** | Tokens stored directly in OS keychain -- no files on disk, no custom encryption layer. Zero deps. |
| **Proxy-aware URL builders** | `configureProxy()` rewrites API_BASE/NUMMUS_BASE so all URL builders route through proxy automatically |
| **No phoenix.robinhood.com** | TLS handshake fails. `api.robinhood.com` has equivalent data. |
| **Unified order methods** | `orderStock()` with optional params vs 10 separate `orderBuyMarket()` etc. |
| **Vitest over bun test** | Proper module isolation via worker processes. Critical for mocking. |
| **Zod schemas** | Runtime validation of all API responses -- Python version lacked this. |
| **ESM-only** | Bun is ESM-native, no CJS compatibility needed. |
