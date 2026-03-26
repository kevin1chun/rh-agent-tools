# Robinhood API Reference

Comprehensive reference for all Robinhood API endpoints, streaming protocols, and data mechanisms used by `robinhood-for-agents`. Organized by use case.

**Base Domains:**
| Domain | Purpose |
|--------|---------|
| `api.robinhood.com` | Primary REST API (equities, options, accounts, market data) |
| `nummus.robinhood.com` | Crypto trading (pairs, orders, holdings) |
| `bonfire.robinhood.com` | Web UI services (alerts, banners, feature flags) |
| `identi.robinhood.com` | Identity (address, suitability, privacy consent) |

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Account & Portfolio](#2-account--portfolio)
3. [Real-Time Market Data](#3-real-time-market-data)
4. [L2 Order Book](#4-l2-order-book)
5. [Stock Trading](#5-stock-trading)
6. [Options Trading](#6-options-trading)
7. [Crypto Trading](#7-crypto-trading)
8. [Historical Data](#8-historical-data)
9. [Markets & Discovery](#9-markets--discovery)
10. [News, Ratings, Earnings](#10-news-ratings-earnings)
11. [Instruments & Fundamentals](#11-instruments--fundamentals)
12. [Undocumented / HAR-Only Endpoints](#12-undocumented--har-only-endpoints)

---

## 1. Authentication

### OAuth2 Token Exchange

| | |
|---|---|
| **Endpoint** | `POST /oauth2/token/` |
| **URL** | `https://api.robinhood.com/oauth2/token/` |
| **Content-Type** | `application/x-www-form-urlencoded` or `application/json` |
| **Client method** | `restoreSession()` (refresh flow) |
| **URL builder** | `urls.oauthToken()` |

**Request body (token refresh):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `grant_type` | string | `"refresh_token"` |
| `refresh_token` | string | Previously issued refresh token |
| `scope` | string | `"internal"` |
| `client_id` | string | `"c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"` (public, hardcoded) |
| `expires_in` | number | `734000` (~8.5 days) |
| `device_token` | string | UUID captured during browser login |

**Response (success):**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 734000,
  "scope": "internal",
  "device_token": "..."
}
```

### Token Revocation

| | |
|---|---|
| **Endpoint** | `POST /oauth2/revoke_token/` |
| **URL** | `https://api.robinhood.com/oauth2/revoke_token/` |
| **Client method** | `logout()` |
| **URL builder** | `urls.oauthRevoke()` |

**Request body:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `client_id` | string | Same public client ID |
| `token` | string | Access token to revoke |

### Challenge / MFA

| | |
|---|---|
| **Endpoint** | `POST /challenge/{challengeId}/respond/` |
| **URL** | `https://api.robinhood.com/challenge/{challengeId}/respond/` |
| **URL builder** | `urls.challenge(challengeId)` |

Used when the login response includes a challenge (SMS code, authenticator, etc.).

### Push Notification MFA

| | |
|---|---|
| **Endpoint** | `GET /push/{challengeId}/get_prompts_status/` |
| **URL builder** | `urls.pushPromptStatus(challengeId)` |

Polls for the status of a push-notification-based MFA approval.

### Pathfinder (Device Trust)

| Endpoint | URL Builder |
|----------|-------------|
| `GET /pathfinder/user_machine/` | `urls.pathfinderUserMachine()` |
| `GET /pathfinder/inquiries/{machineId}/user_view/` | `urls.pathfinderInquiry(machineId)` |

Device registration and trust verification flow.

### Browser Login Flow

The browser-based authentication is purely passive -- Playwright drives a system Chromium-based browser (Brave, Chrome) to `https://robinhood.com/login`. It never interacts with the DOM. Instead:

1. User logs in normally (including any MFA).
2. Playwright intercepts the `POST /oauth2/token` request body to capture `device_token`.
3. Playwright intercepts the `200` response to capture `access_token` and `refresh_token`.
4. Tokens are stored in the OS keychain via `Bun.secrets`.

**Token lifecycle:**
- Access token is validated by making `GET /positions/?nonzero=true`
- On failure, refresh is attempted via `POST /oauth2/token/` with `grant_type=refresh_token`
- Refresh requires both `refresh_token` and `device_token`

### Session Headers

All authenticated requests include:

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {access_token}` |
| `Accept` | `*/*` |
| `Content-Type` | `application/x-www-form-urlencoded; charset=utf-8` |
| `X-Robinhood-API-Version` | `1.431.4` |
| `User-Agent` | `robinhood-for-agents/0.1.0` |

POST requests with complex payloads (orders) switch to `Content-Type: application/json`.

---

## 2. Account & Portfolio

### List All Accounts

| | |
|---|---|
| **Endpoint** | `GET /accounts/` |
| **URL** | `https://api.robinhood.com/accounts/` |
| **Client method** | `getAccounts(opts?)` |
| **URL builder** | `urls.accounts()` |
| **Data type** | `results` (paginated list) |

**Query parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `default_to_all_accounts` | `true` | Include all linked accounts |
| `include_managed` | `true` | Include managed accounts |
| `include_multiple_individual` | `true` | Include multiple individual accounts |

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | API URL for this account |
| `account_number` | string | Account identifier |
| `type` | string | Account type (e.g. `"individual"`) |
| `cash` | string | Available cash balance |
| `buying_power` | string | Total buying power |
| `crypto_buying_power` | string | Crypto-specific buying power |
| `cash_available_for_withdrawal` | string | Withdrawable cash |
| `portfolio_cash` | string | Cash in portfolio |

### Get Single Account

| | |
|---|---|
| **Endpoint** | `GET /accounts/{accountNumber}/` |
| **URL** | `https://api.robinhood.com/accounts/{accountNumber}/` |
| **Client method** | `getAccountProfile(accountNumber?)` |
| **URL builder** | `urls.account(accountNumber)` |

### Get Portfolio

| | |
|---|---|
| **Endpoint** | `GET /portfolios/` or `GET /portfolios/{accountNumber}/` |
| **Client method** | `getPortfolioProfile(accountNumber?)` |
| **URL builders** | `urls.portfolios()`, `urls.portfolio(accountNumber)` |

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `equity` | string\|null | Total portfolio equity |
| `market_value` | string\|null | Total market value |
| `excess_margin` | string\|null | Excess margin |
| `extended_hours_equity` | string\|null | Equity during extended hours |
| `extended_hours_market_value` | string\|null | Market value during extended hours |
| `last_core_equity` | string\|null | Last regular-hours equity |
| `last_core_market_value` | string\|null | Last regular-hours market value |

### Get User Profile

| | |
|---|---|
| **Endpoint** | `GET /user/` |
| **Client method** | `getUserProfile()` |
| **URL builder** | `urls.user()` |

### Get User Basic Info

| | |
|---|---|
| **Endpoint** | `GET /user/basic_info/` |
| **URL builder** | `urls.userBasicInfo()` |

### Get Investment Profile

| | |
|---|---|
| **Endpoint** | `GET /user/investment_profile/` |
| **Client method** | `getInvestmentProfile()` |
| **URL builder** | `urls.investmentProfile()` |

**Response fields:** `risk_tolerance`, `total_net_worth`, `annual_income`, `liquid_net_worth`, `investment_experience`, `investment_objective`, `source_of_funds`, `time_horizon`, `liquidity_needs`, `tax_bracket`.

### Get Positions

| | |
|---|---|
| **Endpoint** | `GET /positions/` |
| **Client method** | `getPositions(opts?)` |
| **URL builder** | `urls.positions()` |
| **Data type** | `pagination` (auto-follows `next` links) |

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `nonzero` | `"true"` | Only return non-zero positions |
| `account_number` | string | Filter by account |
| + multi-account params | | Same as accounts endpoint |

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `instrument` | string | URL to instrument resource |
| `quantity` | string | Shares held |
| `average_buy_price` | string | Average cost basis per share |
| `account_number` | string | Owning account |
| `intraday_quantity` | string | Intraday share count |
| `shares_held_for_buys` | string | Shares locked for pending buys |
| `shares_held_for_sells` | string | Shares locked for pending sells |

### Get Dividends

| | |
|---|---|
| **Endpoint** | `GET /dividends/` |
| **URL builder** | `urls.dividends()` |

**Response fields:** `id`, `amount`, `rate`, `position`, `instrument`, `payable_date`, `record_date`, `state`.

---

## 3. Real-Time Market Data

Robinhood provides three mechanisms for real-time data, used in combination.

### Mechanism 1: dxLink WebSocket Streaming

The primary real-time data path. Uses the dxFeed dxLink protocol over WebSocket.

#### Streaming Token Acquisition

| | |
|---|---|
| **Endpoint** | `GET /marketdata/token/v1/` |
| **URL** | `https://api.robinhood.com/marketdata/token/v1/` |
| **Client method** | `StreamingAuth.fetchToken()` |
| **URL builder** | `urls.marketdataToken()` |

**Query parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `session_id` | UUID | Random UUID per session |
| `session_type` | `"blackwidow"` | Robinhood session type identifier |

**Response:**

```json
{
  "status": "SUCCESS",
  "data": {
    "status": "SUCCESS",
    "data": {
      "token": "...",
      "wss_url": "wss://api.robinhood.com/marketdata/streaming/legend/v2/",
      "expiration": "2026-03-19T04:00:00Z",
      "ttl_ms": "14400000",
      "dxfeed_id": "..."
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `token` | JWT-like token for dxLink AUTH message |
| `wss_url` | WebSocket endpoint |
| `expiration` | ISO 8601 absolute expiry |
| `ttl_ms` | Token TTL in milliseconds (14400000 = 4 hours) |
| `dxfeed_id` | dxFeed account identifier |

**Token format (decoded):**
```
robinhood,blackwidow,,{expiry},{issued},{dxfeed_id},{exchange_permissions}
```

**Exchange permissions:** `CTAUTP;OCEA;CME;CBOT;NYMEX;COMEX;BASE_FEED;OPRA`

**Token refresh strategy:** Refresh at 80% of TTL (0.8 * 14400000 = ~3.2 hours).

#### WebSocket Protocol Handshake

```
WSS URL: wss://api.robinhood.com/marketdata/streaming/legend/v2/
Protocol version: 0.1-DXF-JS/0.5.1
Keepalive timeout: 60 seconds
```

**Sequence diagram:**

```
Client                                    Server
  |                                          |
  |--- WebSocket connect ------------------>|
  |                                          |
  |<-- onopen                                |
  |                                          |
  |--- SETUP (version, keepalive) --------->|
  |                                          |
  |<-- SETUP (server capabilities) ---------|
  |                                          |
  |--- AUTH (token) ----------------------->|
  |                                          |
  |<-- AUTH_STATE { state: "UNAUTHORIZED" } -|  (initial state, expected)
  |<-- AUTH_STATE { state: "AUTHORIZED" } ---|  (handshake complete)
  |                                          |
  |--- CHANNEL_REQUEST (FEED, channel=1) -->|
  |<-- CHANNEL_OPENED (channel=1) ----------|
  |                                          |
  |--- FEED_SETUP (fields, FULL, 250ms) --->|
  |<-- FEED_CONFIG (confirmed fields) ------|
  |                                          |
  |--- FEED_SUBSCRIPTION (add symbols) ---->|
  |<-- FEED_DATA (streaming events) --------|
  |<-- FEED_DATA ...                         |
  |                                          |
  |--- KEEPALIVE (every 30s) -------------->|  (half of 60s timeout)
  |<-- KEEPALIVE ----------------------------|
```

#### Protocol Messages

**SETUP (client -> server):**
```json
{
  "type": "SETUP",
  "channel": 0,
  "version": "0.1-DXF-JS/0.5.1",
  "keepaliveTimeout": 60,
  "acceptKeepaliveTimeout": 60
}
```

**AUTH (client -> server):**
```json
{
  "type": "AUTH",
  "channel": 0,
  "token": "{streaming_token}"
}
```

**AUTH_STATE (server -> client):**

The server sends two AUTH_STATE messages in quick succession during token validation — first `UNAUTHORIZED`, then `AUTHORIZED`. Wait for the `AUTHORIZED` state before opening channels.

```json
{"type": "AUTH_STATE", "channel": 0, "state": "UNAUTHORIZED"}
{"type": "AUTH_STATE", "channel": 0, "state": "AUTHORIZED"}
```

**Server SETUP response** includes `"version": "1.0-2.2.3"` and `"source": "rh_md"` (observed from HAR, March 2026).

**CHANNEL_REQUEST (client -> server):**
```json
{
  "type": "CHANNEL_REQUEST",
  "channel": 1,
  "service": "FEED",
  "parameters": { "contract": "AUTO" }
}
```
Channels use odd numbers (1, 3, 5, ...). Channel 0 is reserved for control messages. The `contract: "AUTO"` parameter is required — Legend always sends it.

**CHANNEL_OPENED (server -> client):**
```json
{
  "type": "CHANNEL_OPENED",
  "channel": 1,
  "service": "FEED",
  "version": 1,
  "parameters": { "contract": "AUTO", "subFormat": "LIST" }
}
```

**FEED_SETUP (client -> server):**
```json
{
  "type": "FEED_SETUP",
  "channel": 1,
  "acceptDataFormat": "FULL",
  "acceptAggregationPeriod": 0.25,
  "acceptEventFields": {
    "Quote": ["eventType", "eventSymbol", "eventTime", "bidPrice", "bidSize", "bidExchangeCode", "bidTime", "askPrice", "askSize", "askExchangeCode", "askTime"]
  }
}
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| `acceptDataFormat` | `"FULL"` or `"COMPACT"` | `FULL` = keyed objects, `COMPACT` = positional arrays. **Order events require FULL** — server rejects COMPACT for Order. |
| `acceptAggregationPeriod` | `0.25` | Server batches events into 250ms windows before sending |
| `acceptEventFields` | `{ EventType: [...] }` | Fields requested for this event type |

**FEED_CONFIG (server -> client):**

The server sends **1-2 FEED_CONFIGs** per channel after FEED_SETUP:
1. First: often without `eventFields` (just confirms `dataFormat` and `aggregationPeriod`)
2. Second: with `eventFields` showing the server's confirmed field order

```json
{
  "type": "FEED_CONFIG",
  "channel": 1,
  "dataFormat": "FULL",
  "aggregationPeriod": 0.25,
  "eventFields": {
    "Quote": ["eventType", "eventSymbol", "eventTime", "bidPrice", "bidSize", "bidExchangeCode", "bidTime", "askPrice", "askSize", "askExchangeCode", "askTime"]
  }
}
```

**Important:** The server may reorder fields in its response. For COMPACT format, you must use the server's field order for positional parsing. For FULL format (keyed objects), field order doesn't matter but the response confirms which fields are available. Wait up to 2 seconds for the FEED_CONFIG with `eventFields` before falling back to requested order.

**FEED_SUBSCRIPTION (client -> server):**

The first subscription on a channel should include `reset: true` to clear any server-side state:
```json
{
  "type": "FEED_SUBSCRIPTION",
  "channel": 1,
  "reset": true,
  "add": [
    { "type": "Quote", "symbol": "AAPL" },
    { "type": "Quote", "symbol": "SPY" }
  ]
}
```

Subsequent subscriptions on the same channel omit `reset`:
```json
{
  "type": "FEED_SUBSCRIPTION",
  "channel": 1,
  "add": [
    { "type": "Quote", "symbol": "MSFT" }
  ]
}
```

To unsubscribe:
```json
{
  "type": "FEED_SUBSCRIPTION",
  "channel": 1,
  "remove": [
    { "type": "Quote", "symbol": "AAPL" }
  ]
}
```

**Event-specific subscription parameters:**

Different event types require additional fields in each `add` entry:

| Event Type | Extra Fields | Example |
|-----------|-------------|---------|
| Quote | (none) | `{ "type": "Quote", "symbol": "AAPL" }` |
| Trade | (none) | `{ "type": "Trade", "symbol": "AAPL" }` |
| TradeETH | (none) | `{ "type": "TradeETH", "symbol": "AAPL" }` |
| Order | `source` (required) | `{ "type": "Order", "symbol": "AAPL", "source": "NTV" }` |
| Candle | `fromTime`, `instrumentType` | `{ "type": "Candle", "symbol": "AAPL{=5m,tho=false,a=m}", "fromTime": 10000000000, "instrumentType": "equity" }` |

- **Order `source: "NTV"`**: NASDAQ TotalView. Without this, the server returns no L2 data. The `source` must also be included in `remove` entries when unsubscribing.
- **Candle `fromTime: 10000000000`**: Requests historical candle backfill alongside the live stream. Must also be included in `remove` entries when unsubscribing.
- **Candle `instrumentType: "equity"`**: Required for equity candles. Must also be included in `remove` entries when unsubscribing.

**Changing candle interval (observed from Legend):**

To switch candle timeframes (e.g., 5m → 2m), Legend reuses the existing Candle channel and swaps subscriptions. The sequence:

1. **Add** the new interval subscription (no `reset`):
```json
{
  "channel": 7,
  "type": "FEED_SUBSCRIPTION",
  "add": [{ "fromTime": 10000000000, "instrumentType": "equity", "symbol": "NFLX{=2m,tho=false,a=m}", "type": "Candle" }]
}
```

2. **Remove** the old interval subscription (~30s later):
```json
{
  "channel": 7,
  "type": "FEED_SUBSCRIPTION",
  "remove": [{ "fromTime": 10000000000, "instrumentType": "equity", "symbol": "NFLX{=5m,tho=false,a=m}", "type": "Candle" }]
}
```

Key observations:
- The channel stays open — no need to close/reopen or re-send FEED_SETUP.
- `reset: true` is only sent on the **first** subscription for the channel, never on interval changes.
- `remove` entries must include `fromTime` and `instrumentType` (mirroring `add`).
- Legend adds the new interval before removing the old, ensuring no gap in data delivery.
- Only the Candle subscription changes — Trade, Quote, and Order feeds continue uninterrupted on their own channels.

**Multi-asset symbol formats:**

| Asset Type | Format | Examples |
|-----------|--------|---------|
| Equity | Ticker | `SPY`, `AAPL`, `NFLX` |
| Crypto | `{base}/{quote}:{exchange}` | `DOGE/USD:CXBITS`, `BTC/USD:CXBITS` |
| Options | `.{underlying}{expiry}{type}{strike}` | `.NFLX260618C95`, `.AAPL260620P200` |
| Candle (equity) | `{symbol}{={period},tho={bool},a={agg}}` | `SPY{=5m,tho=false,a=m}` |
| Candle (options) | `{option_symbol}{={period},a={agg},price=mark}` | `.SPXW260323C6570{=2m,a=m,price=mark}` |

Candle symbol format breakdown:
- `=5m` — candle period (1m, 2m, 5m, 30s, 1h, 1d, etc.)
- `tho=false` — trade history only; `false` = include extended hours data (equity only)
- `a=m` — aggregation mode; `m` = market
- `price=mark` — use mark price for options candles (replaces `tho` parameter)

**Options candle differences:**
- Options use `price=mark` instead of `tho=false` — they chart the mark (mid) price, not last trade
- `volume`, `impVolatility`, and `openInterest` return as the string `"NaN"` (not null or number)
- `eventTime: 0` on all historical backfill candles; only the live candle gets a real timestamp
- `eventFlags: 4` (TX_PENDING) on the most recent candle indicates it's still accumulating
- Candles arrive newest-first in the initial backfill batch
- Options candles open on a separate channel from equity candles

**FEED_DATA (server -> client, FULL format):**

When `acceptDataFormat: "FULL"`, data arrives as an array of keyed objects:
```json
{
  "type": "FEED_DATA",
  "channel": 5,
  "data": [
    {
      "eventType": "Quote",
      "eventSymbol": "AAPL",
      "bidPrice": 175.50,
      "bidSize": 100,
      "bidExchangeCode": "Q",
      "bidTime": 0,
      "askPrice": 175.55,
      "askSize": 200,
      "askExchangeCode": "Q",
      "askTime": 0
    }
  ]
}
```

**FEED_DATA (server -> client, COMPACT format):**
```json
{
  "type": "FEED_DATA",
  "channel": 1,
  "data": [
    "Quote",
    ["Quote", "AAPL", 1710000000000, 175.50, 100, "Q", 175.55, 200, "Q"],
    ["Quote", "SPY", 1710000000000, 510.20, 500, "Q", 510.25, 300, "Q"]
  ]
}
```
COMPACT `data` contains event type markers (strings) followed by positional arrays. Values correspond to the field order from FEED_CONFIG.

**Note:** Order events **require FULL format** — the server rejects COMPACT for Order subscriptions. Our implementation uses FULL for all event types.

**KEEPALIVE (bidirectional):**
```json
{
  "type": "KEEPALIVE",
  "channel": 0
}
```
Client sends keepalive every 30 seconds (half the 60s timeout) if no other message was sent.

**ERROR (server -> client):**
```json
{
  "type": "ERROR",
  "channel": 0,
  "error": "error_code",
  "message": "Human-readable description"
}
```

**CHANNEL_CANCEL (client -> server):**
```json
{
  "type": "CHANNEL_CANCEL",
  "channel": 1
}
```

**MD_SETUP (client -> server, optional):**

Legend sends this market-data-specific setup message after AUTH. It is not required for streaming to work but is included here for completeness:
```json
{
  "type": "MD_SETUP",
  "enable_heartbeat_timestamp": true,
  "enable_logging_raw_incoming_message": false,
  "enable_subscription_debugging": false
}
```

#### WebSocket Upgrade Authentication

**Non-browser clients MUST pass auth headers during the WebSocket upgrade:**

```
Authorization: Bearer {access_token}
Origin: https://robinhood.com
```

The browser web UI authenticates via httpOnly cookies, but programmatic clients (Bun, Node.js) receive **401 Unauthorized** without these headers. The `access_token` is the same OAuth2 token used for REST API calls (not the dxLink streaming token).

#### Legend Channel Layout (from HAR telemetry)

Robinhood Legend opens **one FEED channel per event type** on a single WebSocket connection. Channel assignment depends on subscription order — the first CHANNEL_REQUEST gets channel 1, second gets 3, etc. For NFLX viewed from a chart widget:

| Channel | Event Type | Symbol Format | Unsub Timeout | Purpose |
|---------|-----------|---------------|---------------|---------|
| 1 | **Candle** | `NFLX{=2m,tho=false,a=m}` | 30,000ms | 2-min OHLCV candles for chart |
| 3 | **TradeETH** | `SPY` | 30,000ms | Extended-hours trade price |
| 5 | **Quote** | `SPY` | 30,000ms | NBBO bid/ask price + size |
| 7 | **Candle** | `SPY{=5m,tho=false,a=m}` | 30,000ms | 5-min OHLCV candles for chart |
| 9 | **Order** | `SPY` | 5,000ms | L2 order book levels |

Notes:
- Channels use **odd-numbered IDs** (1, 3, 5, 7, 9...).
- **Order has a shorter unsubscribe timeout** (5s vs 30s) — L2 data is cleaned up more aggressively when user navigates away.
- **Candle symbol format** includes period and flags: `{=5m,tho=false,a=m}` means 5-minute candles, `tho=false` (trade history only = false), `a=m` (aggregation = market).
- Time-to-first-value: Trade ~691ms, TradeETH ~830ms after subscription.
- Crypto uses different symbols: `DOGE/USD:CXBITS` for Quote/Trade.

#### Event Type Field Schemas

One FEED channel is opened per event type. Each channel declares the fields it wants in FEED_SETUP.

##### Quote Event

Real-time best bid/ask (NBBO).

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | Always `"Quote"` |
| `eventSymbol` | string | Ticker symbol |
| `eventTime` | number | Event timestamp (epoch ms) |
| `bidPrice` | number | Best bid price |
| `bidSize` | number | Bid size (shares) |
| `bidExchangeCode` | string | Exchange code for best bid |
| `bidTime` | number | Bid quote timestamp (epoch ms) |
| `askPrice` | number | Best ask price |
| `askSize` | number | Ask size (shares) |
| `askExchangeCode` | string | Exchange code for best ask |
| `askTime` | number | Ask quote timestamp (epoch ms) |

**Note:** Legend requests `bidTime`/`askTime` instead of exchange codes (cares about quote freshness). Our implementation requests both.

##### Trade Event

Last trade / time and sales.

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | `"Trade"` |
| `eventSymbol` | string | Ticker symbol |
| `eventTime` | number | Event timestamp (epoch ms) |
| `price` | number | Last trade price |
| `size` | number | Trade size (shares) |
| `change` | number | Price change from previous close |
| `dayVolume` | number | Cumulative volume for the day |
| `exchangeCode` | string | Exchange where trade occurred |
| `tickDirection` | string | `"UPTICK"`, `"DOWNTICK"`, `"ZERO_UPTICK"`, `"ZERO_DOWNTICK"` |

##### TradeETH Event

Extended-hours trade (same fields as Trade).

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | `"TradeETH"` |
| `eventSymbol` | string | Ticker symbol |
| `eventTime` | number | Event timestamp (epoch ms) |
| `price` | number | Extended-hours trade price |
| `size` | number | Trade size |
| `change` | number | Price change |
| `dayVolume` | number | Cumulative extended-hours volume |
| `exchangeCode` | string | Exchange code |
| `tickDirection` | string | Tick direction |

##### Candle Event

OHLCV candlestick aggregation.

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | `"Candle"` |
| `eventSymbol` | string | Symbol with period format (e.g. `"AAPL{=5m,tho=false,a=m}"`) |
| `eventTime` | number | Server event timestamp (epoch ms) |
| `time` | number | Candle period start timestamp (epoch ms) — use this for chart X axis |
| `open` | number | Open price |
| `high` | number | High price |
| `low` | number | Low price |
| `close` | number | Close price |
| `volume` | number | Volume during candle |
| `count` | number | Number of trades in candle |
| `vwap` | number | Volume-weighted average price |
| `impVolatility` | number | Implied volatility (useful for options analysis) |
| `openInterest` | number\|NaN | Open interest (NaN for equities, populated for options) |
| `eventFlags` | number | Event flags (0 = normal, 4 = snapshot/pending) |
| `sequence` | number | Sequence number for ordering |

**Candle subscription parameters:**

```json
{
  "type": "Candle",
  "symbol": "SPY{=5m,tho=false,a=m}",
  "fromTime": 10000000000,
  "instrumentType": "equity"
}
```

- `fromTime: 10000000000` — requests historical candle backfill from this epoch ms (effectively "start of day")
- `instrumentType: "equity"` — required for equity candles
- Symbol format: `{symbol}{={period},tho={tradeHoursOnly},a={aggregation}}`
  - Period: `1m`, `2m`, `5m`, `30m`, `1h`, `1d`, etc.
  - `tho=false` — include extended hours data; `tho=true` — regular hours only
  - `a=m` — aggregation mode (market)

##### Order Event (L2)

Individual order book entries from NASDAQ TotalView (NTV). See [Section 4](#4-l2-order-book) for full book construction details.

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | `"Order"` |
| `eventSymbol` | string | Ticker symbol |
| `eventFlags` | number | Event flags (0 = normal) |
| `index` | number/string | Unique order index (17+ digits — **store as string** to avoid precision loss) |
| `side` | string | `"BUY"` or `"SELL"` |
| `sequence` | number | Sequence number for ordering |
| `price` | number | Price level |
| `size` | number | Size at this level (0 or `"NaN"` = remove from book) |
| `time` | number | Event timestamp (epoch ms) |

**Critical requirements:**
- **MUST use FULL data format** — server rejects COMPACT for Order events
- **MUST include `source: "NTV"` in subscription** — plain symbol subscription returns no data
- **Index precision**: indices are 17+ digit integers exceeding `Number.MAX_SAFE_INTEGER` (2^53). Store as strings to prevent key collisions.
- **Field name is `side`**, not `ordeSide` or `orderSide` (earlier generic dxFeed docs used different names)

#### Reconnection Strategy

| Parameter | Value |
|-----------|-------|
| Max reconnect attempts | 10 |
| Base delay | 1,000 ms |
| Max delay | 30,000 ms |
| Backoff formula | `min(1000 * 2^attempt, 30000) + random(0, 1000)` |

On disconnect:
1. All order books are marked `stale`.
2. Exponential backoff with jitter between reconnect attempts.
3. On successful reconnect, all books are reset and re-subscribed.
4. After 10 failures, the manager goes dormant. Next tool call triggers a fresh connection.

### Mechanism 2: REST Polling (Web UI Pattern)

The Robinhood web UI polls REST endpoints alongside the WebSocket for redundancy.

**Equities polling:**

| | |
|---|---|
| **Endpoint** | `GET /marketdata/quotes/` |
| **Interval** | ~1.2 seconds |
| **Initial bounds** | `bounds=24_5` |
| **Subsequent bounds** | `bounds=extended` |

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `ids` | Comma-separated instrument IDs |
| `bounds` | `"24_5"` (24.5 hours) or `"extended"` |
| `include_inactive` | `"true"` |

**Crypto polling:**

| | |
|---|---|
| **Endpoint** | `GET /marketdata/forex/quotes/` |
| **Interval** | ~1.2 seconds |

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `ids` | Comma-separated currency pair IDs |
| `routing_group` | `"fee"` |

### Mechanism 3: REST Snapshots (One-Shot Fetches)

For non-streaming, request-response quote retrieval.

| Endpoint | Client Method | Description |
|----------|---------------|-------------|
| `GET /quotes/?symbols={sym}` | `getQuotes(symbols)` | Batch equity quotes by symbol |
| `GET /quotes/{SYMBOL}/` | -- | Single equity quote |
| `GET /marketdata/forex/quotes/{pairId}/` | `getCryptoQuote(symbol)` | Single crypto quote |
| `GET /fundamentals/?symbols={sym}` | `getFundamentals(symbols)` | Batch fundamentals |
| `GET /fundamentals/{SYMBOL}/` | -- | Single stock fundamentals |

---

## 4. L2 Order Book

### Streaming Order Events

The L2 order book is built from `Order` events received via the dxLink WebSocket. There is no REST endpoint for L2 data.

**Subscription requirements (discovered via CDP capture of Legend):**

| Parameter | Value | Why |
|-----------|-------|-----|
| Data format | `FULL` (keyed objects) | Server rejects `COMPACT` for Order events |
| Source | `"NTV"` (NASDAQ TotalView) | Required in `FEED_SUBSCRIPTION` — plain symbol subscription returns no data |
| Aggregation period | `0.25` (250ms) | Sent in `FEED_SETUP` via `acceptAggregationPeriod` |
| Field name for side | `"side"` | Not `"orderSide"` or `"ordeSide"` |
| Protocol version | `0.1-DXF-JS/0.5.1` | Sent in SETUP handshake |

**Subscription flow:**

1. `StreamingManager.subscribeOrderBook(symbol)` ensures WebSocket connection (with `Authorization` + `Origin` headers on upgrade).
2. Opens a FEED channel, sends `FEED_SETUP` with `acceptDataFormat: "FULL"` and `acceptAggregationPeriod: 0.25`.
3. Waits for `FEED_CONFIG` with confirmed `eventFields` (server sends 2 configs — first without fields, second with).
4. Sends `FEED_SUBSCRIPTION` with `source: "NTV"` on each symbol entry.
5. Each incoming `Order` event is processed into the book.

**Order event format (FULL):**

```json
{
  "eventFlags": 0,
  "eventSymbol": "SPY",
  "eventType": "Order",
  "index": "22047776527353334",
  "side": "BUY",
  "sequence": 12,
  "price": 660.50,
  "size": 200,
  "time": 1773857417313
}
```

**Processing rules:**

| Condition | Action |
|-----------|--------|
| `size > 0` and `Number.isFinite(size)` | Insert or update the level keyed by `index` |
| `size <= 0` or `size = "NaN"` (string) | Remove the level keyed by `index` |
| `side == "BUY"` | Update the bids side |
| `side == "SELL"` | Update the asks side |
| Missing `side` or `index` | Event is silently ignored |

**After-hours behavior:** The dxFeed server sends Order events with `size: "NaN"` (string) for stale levels. These are treated as removals. No new Order events flow after market close — the book drains to empty. Legend displays the last known book state visually but does not receive updates.

**Index precision:** dxFeed Order indices are 17+ digit integers (e.g., `"22047776527353334"`) that exceed JavaScript's `Number.MAX_SAFE_INTEGER` (2^53). The `OrderBook` class stores indices as **strings** to prevent precision loss and key collisions.

### Book Construction

The `OrderBook` class (`src/client/streaming/order-book.ts`) maintains two maps keyed by string `index`:

```
bids: Map<string, OrderBookLevel>   // side == "BUY"
asks: Map<string, OrderBookLevel>   // side == "SELL"
```

Multiple indices can map to the same price (from different NTV sources). `getSnapshot()` returns all levels sorted by price without further aggregation. For visual display, consumers may bin levels into price increments (see Client-Side Price Binning below).

**How levels move on the price ladder:**
1. Order at $660.50 cancelled → dxFeed sends `index=X, size=0` → `map.delete("X")`
2. New order at $660.45 → dxFeed sends `index=Y, price=660.45, size=300` → `map.set("Y", ...)`
3. The book naturally reflects the new state after both events process.

**L1 + L2 merge strategy (for visualization):**

The stream viewer merges Quote (L1 NBBO) and Order (L2 depth) into a single visualization:
1. Collect all L2 levels from the `OrderBook` snapshot
2. Inject L1 NBBO (from Quote events) at the top — replace matching price or insert as best level
3. Sort bids descending, asks ascending
4. Render all levels identically; BBO (index 0) renders slightly brighter

This ensures consistent display whether only L1 is available (after hours) or L1 + L2 (market hours).

**Snapshot format (`OrderBookSnapshot`):**

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Ticker symbol |
| `bids` | `OrderBookLevel[]` | Sorted descending by price (best bid first) |
| `asks` | `OrderBookLevel[]` | Sorted ascending by price (best ask first) |
| `spread` | number\|null | `bestAsk - bestBid` |
| `midpoint` | number\|null | `(bestBid + bestAsk) / 2` |
| `lastUpdated` | number | Timestamp of last event processed |
| `eventCount` | number | Total events processed for this book |
| `stale` | boolean | `true` if disconnected since last update |

**OrderBookLevel:**

| Field | Type | Description |
|-------|------|-------------|
| `price` | number | Price level |
| `size` | number | Aggregate size at this level |
| `exchangeCode` | string | Exchange (empty for NTV composite) |
| `count` | number | Number of orders (0 for NTV) |
| `time` | number | Event time (epoch ms) |

**Default depth:** 50 levels per side (configurable via `maxDepth` constructor param).

**Auto-subscribe behavior:** `getOrderBookSnapshot()` auto-subscribes if the symbol is not yet streaming, then waits up to 3 seconds for initial data before returning.

### Client-Side Price Binning (from HAR analysis)

The Robinhood Legend web UI performs **client-side aggregation** on top of the raw Order events from dxFeed. The server sends individual price-level updates; the client bins them into visual bars.

**Chart OrderBook indicator configuration (captured from HAR):**

```json
{
  "orderBookAggregation": "AUTO",
  "priceIncrement": 0.05,
  "maxRows": 100,
  "reverseZones": true
}
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| `orderBookAggregation` | `"AUTO"` | Bin size adjusts automatically with zoom level |
| `priceIncrement` | `0.05` | SPY uses $0.05 price bins (all orders within a $0.05 range are summed) |
| `maxRows` | `100` | Maximum price levels displayed |
| `reverseZones` | `true` | Visual layout option |

**Visual styling:**
- Bids: `rgba(204, 255, 0, 0.32)` (green)
- Asks: `rgba(255, 76, 76, 0.32)` (red)
- Bar width is proportional to aggregate `size` at each binned price level

**Crypto binning** parameters come from the `/currency_pairs/` API response:

| Symbol | `min_tick_size` | `starting_bin_size` | Default zoom index | Effective default bin |
|--------|----------------|--------------------|--------------------|---------------------|
| BTC-USD | $1.00 | $1.00 | 2 | $5.00 |
| ETH-USD | $0.10 | $0.10 | 1 | $0.50 |
| SOL-USD | $0.001 | $0.01 | 2 | $0.05 |
| DOGE-USD | $0.00001 | $0.00001 | 1 | $0.000025 |

Formula: `effective_bin = starting_bin_size * zoom_multipliers[default_zoom_index]`

**Implementation note:** The current `robinhood-for-agents` `OrderBook` class returns raw levels keyed by `index` (correct for tracking dxFeed events), without price-level binning. To match Legend's visual aggregation, a consumer would group levels into price bins and sum their sizes.

### MCP Tools for Order Book

| Tool | Description |
|------|-------------|
| `robinhood_subscribe_l2` | Start streaming L2 order book for a symbol |
| `robinhood_get_order_book` | Get snapshot (auto-subscribes); `depth` param (1-100, default 10) |
| `robinhood_unsubscribe_l2` | Stop streaming for a symbol |

---

## 5. Stock Trading

### Place Stock Order

| | |
|---|---|
| **Endpoint** | `POST /orders/` |
| **URL** | `https://api.robinhood.com/orders/` |
| **Client method** | `orderStock(symbol, side, quantity, opts?)` |
| **URL builder** | `urls.stockOrders()` |
| **Content-Type** | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account` | string | yes | Account URL (e.g. `https://api.robinhood.com/accounts/{acct}/`) |
| `instrument` | string | yes | Instrument URL |
| `symbol` | string | yes | Ticker symbol |
| `side` | string | yes | `"buy"` or `"sell"` |
| `quantity` | string | yes | Number of shares (fractional allowed for market orders) |
| `type` | string | yes | `"market"` or `"limit"` |
| `trigger` | string | yes | `"immediate"` or `"stop"` |
| `time_in_force` | string | yes | `"gfd"`, `"gtc"`, `"ioc"`, `"opg"` |
| `price` | string | if limit | Limit price |
| `stop_price` | string | if stop | Stop trigger price |
| `extended_hours` | boolean | no | Enable extended hours (default `false`) |
| `preset_percent_limit` | string | no | Price collar for market buys (default `"0.05"` = 5%) |
| `trailing_peg` | object | no | Trailing stop configuration |
| `ref_id` | string | yes | Client-generated UUID for idempotency |

**Order type determination logic:**

| Parameters | `type` | `trigger` |
|-----------|--------|-----------|
| None | `market` | `immediate` |
| `limitPrice` only | `limit` | `immediate` |
| `stopPrice` only | `market` | `stop` |
| `stopPrice` + `limitPrice` | `limit` | `stop` |
| `trailAmount` | `market` | `stop` |

**Trailing stop `trailing_peg` object:**
```json
{
  "type": "percentage",
  "percentage": "5.0"
}
```
or
```json
{
  "type": "amount",
  "price": { "amount": "2.50" }
}
```

**Fractional order constraints:** Must be market orders with `time_in_force: "gfd"`. No limit, stop, or trailing stop allowed.

### List Stock Orders

| | |
|---|---|
| **Endpoint** | `GET /orders/` |
| **Client method** | `getAllStockOrders(opts?)` / `getOpenStockOrders(opts?)` |
| **URL builder** | `urls.stockOrders()` |
| **Data type** | `pagination` |

Open orders are identified by having a non-null `cancel` field.

### Get Single Stock Order

| | |
|---|---|
| **Endpoint** | `GET /orders/{orderId}/` |
| **Client method** | `getStockOrder(orderId)` |
| **URL builder** | `urls.stockOrder(orderId)` |

**Response fields (`StockOrder`):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Order UUID |
| `state` | string | `"queued"`, `"confirmed"`, `"partially_filled"`, `"filled"`, `"cancelled"`, `"failed"` |
| `side` | string | `"buy"` or `"sell"` |
| `quantity` | string | Ordered quantity |
| `price` | string\|null | Limit price |
| `average_price` | string\|null | Average fill price |
| `type` | string | `"market"` or `"limit"` |
| `trigger` | string | `"immediate"` or `"stop"` |
| `stop_price` | string\|null | Stop trigger price |
| `time_in_force` | string | TIF code |
| `cancel` | string\|null | Cancel URL (non-null = cancellable) |
| `cumulative_quantity` | string | Shares filled so far |
| `fees` | string | Order fees |
| `extended_hours` | boolean | Extended hours flag |
| `trailing_peg` | object\|null | Trailing stop details |
| `executions` | array | Fill execution records |
| `created_at` | string | ISO 8601 creation time |
| `updated_at` | string | ISO 8601 last update |
| `ref_id` | string | Client-provided idempotency UUID |

### Cancel Stock Order

| | |
|---|---|
| **Endpoint** | `POST /orders/{orderId}/cancel/` |
| **Client method** | `cancelStockOrder(orderId)` |
| **URL builder** | `urls.cancelStockOrder(orderId)` |

Returns `204 No Content` on success.

---

## 6. Options Trading

### Get Option Chains

| | |
|---|---|
| **Endpoint** | `GET /options/chains/` |
| **Client method** | `getChains(symbol, opts?)` |
| **URL builder** | `urls.optionChains()` |
| **Data type** | `results` |

**Query parameters (equity):**

| Parameter | Description |
|-----------|-------------|
| `equity_instrument_ids` | Instrument UUID (resolved from symbol) |
| `state` | `"active"` |

**Query parameters (index, e.g. SPX, NDX, VIX):**

| Parameter | Description |
|-----------|-------------|
| `ids` | Comma-separated `tradable_chain_ids` from the index instrument |

**Response fields (`OptionChain`):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Chain UUID |
| `expiration_dates` | string[] | Available expiration dates (YYYY-MM-DD) |
| `symbol` | string | Underlying symbol |
| `can_open_position` | boolean | Whether new positions can be opened |
| `underlying_instruments` | array | Underlying instrument references |
| `min_ticks` | object | Minimum tick sizes: `above_tick`, `below_tick`, `cutoff_price` |

For index options with multiple chains (e.g. SPX monthlies vs SPXW weeklies), the client returns the chain containing the requested expiration date, or the chain with the most expirations by default.

### Get Single Chain

| | |
|---|---|
| **Endpoint** | `GET /options/chains/{chainId}/` |
| **URL builder** | `urls.optionChain(chainId)` |

### Find Tradable Options

| | |
|---|---|
| **Endpoint** | `GET /options/instruments/` |
| **Client method** | `findTradableOptions(symbol, opts?)` |
| **URL builder** | `urls.optionInstruments()` |
| **Data type** | `pagination` |

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `chain_id` | string | Chain UUID (required) |
| `expiration_dates` | string | YYYY-MM-DD filter |
| `strike_price` | string | Specific strike |
| `type` | string | `"call"` or `"put"` |

Client applies additional client-side filtering because the API doesn't always honor query params precisely.

**Response fields (`OptionInstrument`):**

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Instrument URL |
| `id` | string | Option instrument UUID |
| `type` | string | `"call"` or `"put"` |
| `strike_price` | string | Strike price |
| `expiration_date` | string | YYYY-MM-DD |
| `state` | string | e.g. `"active"` |
| `tradability` | string | e.g. `"tradable"` |
| `chain_id` | string | Parent chain UUID |
| `chain_symbol` | string | Underlying symbol |

### Get Option Market Data (Greeks / IV)

| | |
|---|---|
| **Endpoint** | `GET /marketdata/options/{optionId}/` |
| **Client method** | `getOptionMarketData(symbol, expDate, strike, type)` |
| **URL builder** | `urls.optionMarketData(optionId)` |

**Response fields (`OptionMarketData`):**

| Field | Type | Description |
|-------|------|-------------|
| `implied_volatility` | string\|null | IV as decimal (e.g. `"0.3512"`) |
| `delta` | string\|null | Delta |
| `gamma` | string\|null | Gamma |
| `theta` | string\|null | Theta (per day) |
| `vega` | string\|null | Vega |
| `rho` | string\|null | Rho |
| `mark_price` | string\|null | Mark (mid) price per contract |
| `ask_price` | string\|null | Ask price |
| `bid_price` | string\|null | Bid price |
| `high_price` | string\|null | Session high |
| `low_price` | string\|null | Session low |
| `last_trade_price` | string\|null | Last trade price |
| `open_interest` | number | Open interest |
| `volume` | number | Session volume |
| `chance_of_profit_short` | string\|null | Probability of profit if sold |
| `chance_of_profit_long` | string\|null | Probability of profit if bought |
| `break_even_price` | string\|null | Break-even at expiration |

### Get Option Positions

| | |
|---|---|
| **Endpoint** | `GET /options/positions/` |
| **URL builder** | `urls.optionPositions()` |

| | |
|---|---|
| **Endpoint** | `GET /options/aggregate_positions/` |
| **URL builder** | `urls.optionAggregatePositions()` |

### Place Option Order

| | |
|---|---|
| **Endpoint** | `POST /options/orders/` |
| **Client method** | `orderOption(symbol, legs, price, quantity, direction, opts?)` |
| **URL builder** | `urls.optionOrders()` |
| **Content-Type** | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account` | string | yes | Account URL |
| `direction` | string | yes | `"debit"` (buying) or `"credit"` (selling) |
| `legs` | array | yes | One or more option legs |
| `price` | string | yes | Net price per contract |
| `quantity` | string | yes | Number of contracts |
| `type` | string | yes | Always `"limit"` |
| `trigger` | string | yes | `"immediate"` or `"stop"` |
| `time_in_force` | string | yes | Default `"gfd"` |
| `market_hours` | string | yes | `"regular_hours"` |
| `stop_price` | string | no | Stop trigger price |
| `override_day_trade_checks` | boolean | yes | `true` |
| `override_dtbp_checks` | boolean | yes | `true` |
| `ref_id` | string | yes | Idempotency UUID |

**Leg structure:**

| Field | Type | Description |
|-------|------|-------------|
| `option_id` | string | Option instrument UUID |
| `side` | string | `"buy"` or `"sell"` |
| `position_effect` | string | `"open"` or `"close"` |
| `ratio_quantity` | number | Multiplier (default 1) |

Supports multi-leg strategies (spreads, straddles, condors) via multiple legs.

### List Option Orders

| | |
|---|---|
| **Endpoint** | `GET /options/orders/` |
| **Client method** | `getAllOptionOrders(opts?)` / `getOpenOptionOrders(opts?)` |
| **URL builder** | `urls.optionOrders()` |
| **Data type** | `pagination` |

Open orders are identified by having a non-null `cancel_url` field.

### Get Single Option Order

| | |
|---|---|
| **Endpoint** | `GET /options/orders/{orderId}/` |
| **Client method** | `getOptionOrder(orderId)` |
| **URL builder** | `urls.optionOrder(orderId)` |

### Cancel Option Order

| | |
|---|---|
| **Endpoint** | `POST /options/orders/{orderId}/cancel/` |
| **Client method** | `cancelOptionOrder(orderId)` |
| **URL builder** | `urls.cancelOptionOrder(orderId)` |

---

## 7. Crypto Trading

All crypto trading endpoints use `nummus.robinhood.com` except quotes and historicals, which use `api.robinhood.com`.

### Get Currency Pairs

| | |
|---|---|
| **Endpoint** | `GET /currency_pairs/` |
| **URL** | `https://nummus.robinhood.com/currency_pairs/` |
| **Client method** | Used internally by `getCryptoQuote()`, `orderCrypto()` |
| **URL builder** | `urls.cryptoCurrencyPairs()` |
| **Data type** | `results` |

Returns all tradable crypto pairs. Each pair has an `id` (UUID) and `asset_currency.code` (e.g. `"BTC"`).

### Get Crypto Quote

| | |
|---|---|
| **Endpoint** | `GET /marketdata/forex/quotes/{pairId}/` |
| **URL** | `https://api.robinhood.com/marketdata/forex/quotes/{pairId}/` |
| **Client method** | `getCryptoQuote(symbol)` |
| **URL builder** | `urls.cryptoQuote(pairId)` |

Note: Crypto uses REST-only quotes (no dxLink streaming for crypto).

**Response fields (`CryptoQuote`):**

| Field | Type | Description |
|-------|------|-------------|
| `mark_price` | string\|null | Mid-market price |
| `ask_price` | string\|null | Ask price |
| `bid_price` | string\|null | Bid price |
| `high_price` | string\|null | 24h high |
| `low_price` | string\|null | 24h low |
| `open_price` | string\|null | 24h open |
| `volume` | string\|null | 24h volume |
| `symbol` | string | Trading pair symbol |
| `id` | string | Currency pair UUID |

### Get Crypto Holdings

| | |
|---|---|
| **Endpoint** | `GET /holdings/` |
| **URL** | `https://nummus.robinhood.com/holdings/` |
| **Client method** | `getCryptoPositions()` |
| **URL builder** | `urls.cryptoHoldings()` |
| **Data type** | `results` |

**Response fields (`CryptoPosition`):**

| Field | Type | Description |
|-------|------|-------------|
| `currency.code` | string | e.g. `"BTC"` |
| `currency.name` | string | e.g. `"Bitcoin"` |
| `quantity` | string | Total quantity held |
| `quantity_available` | string | Available (not locked) quantity |
| `cost_bases[].direct_cost_basis` | string | Cost basis in USD |

### Get Crypto Accounts

| | |
|---|---|
| **Endpoint** | `GET /accounts/` |
| **URL** | `https://nummus.robinhood.com/accounts/` |
| **URL builder** | `urls.cryptoAccounts()` |

### Place Crypto Order

| | |
|---|---|
| **Endpoint** | `POST /orders/` |
| **URL** | `https://nummus.robinhood.com/orders/` |
| **Client method** | `orderCrypto(symbol, side, amountOrQuantity, opts?)` |
| **URL builder** | `urls.cryptoOrders()` |
| **Content-Type** | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currency_pair_id` | string | yes | Currency pair UUID |
| `side` | string | yes | `"buy"` or `"sell"` |
| `type` | string | yes | `"market"` or `"limit"` |
| `quantity` | string | conditional | Quantity in crypto units |
| `price` | string | if limit | Limit price in USD |
| `time_in_force` | string | yes | `"gtc"` |
| `ref_id` | string | yes | Idempotency UUID |

**Amount specification:** The client supports specifying either `quantity` (crypto units) or `price` (USD amount). When specifying USD amount with a limit price, quantity is derived as `amount / limitPrice`.

### List Crypto Orders

| | |
|---|---|
| **Endpoint** | `GET /orders/` |
| **URL** | `https://nummus.robinhood.com/orders/` |
| **Client method** | `getAllCryptoOrders(opts?)` / `getOpenCryptoOrders(opts?)` |
| **URL builder** | `urls.cryptoOrders()` |
| **Data type** | `pagination` |

Open crypto orders are identified by `state` being `"unconfirmed"` or `"confirmed"`.

### Get Single Crypto Order

| | |
|---|---|
| **Endpoint** | `GET /orders/{orderId}/` |
| **URL** | `https://nummus.robinhood.com/orders/{orderId}/` |
| **Client method** | `getCryptoOrder(orderId)` |
| **URL builder** | `urls.cryptoOrder(orderId)` |

### Cancel Crypto Order

| | |
|---|---|
| **Endpoint** | `POST /orders/{orderId}/cancel/` |
| **URL** | `https://nummus.robinhood.com/orders/{orderId}/cancel/` |
| **Client method** | `cancelCryptoOrder(orderId)` |
| **URL builder** | `urls.cancelCryptoOrder(orderId)` |

---

## 8. Historical Data

### Stock Historicals (Batch)

| | |
|---|---|
| **Endpoint** | `GET /quotes/historicals/` |
| **Client method** | `getStockHistoricals(symbols, opts?)` |
| **URL builder** | `urls.stockHistoricals()` |
| **Data type** | `results` |

**Query parameters:**

| Parameter | Default | Options |
|-----------|---------|---------|
| `symbols` | required | Comma-separated symbols |
| `interval` | `"day"` | `"5minute"`, `"10minute"`, `"hour"`, `"day"`, `"week"` |
| `span` | `"month"` | `"day"`, `"week"`, `"month"`, `"3month"`, `"year"`, `"5year"`, `"all"` |
| `bounds` | `"regular"` | `"regular"`, `"extended"`, `"trading"`, `"24_7"` |

### Stock Historicals (Single Symbol)

| | |
|---|---|
| **Endpoint** | `GET /quotes/historicals/{SYMBOL}/` |
| **URL builder** | `urls.stockHistoricalsFor(symbol)` |

Same parameters as batch endpoint.

### Portfolio Historicals

| | |
|---|---|
| **Endpoint** | `GET /portfolios/historicals/{accountNumber}/` |
| **URL builder** | `urls.portfolioHistoricals(accountNumber)` |

### Crypto Historicals

| | |
|---|---|
| **Endpoint** | `GET /marketdata/forex/historicals/{pairId}/` |
| **URL** | `https://api.robinhood.com/marketdata/forex/historicals/{pairId}/` |
| **Client method** | `getCryptoHistoricals(symbol, opts?)` |
| **URL builder** | `urls.cryptoHistoricals(pairId)` |
| **Data type** | `results` |

**Query parameters:**

| Parameter | Default | Options |
|-----------|---------|---------|
| `interval` | `"day"` | `"5minute"`, `"10minute"`, `"hour"`, `"day"`, `"week"` |
| `span` | `"month"` | `"day"`, `"week"`, `"month"`, `"3month"`, `"year"`, `"5year"` |
| `bounds` | `"24_7"` | `"regular"`, `"extended"`, `"24_7"` |

### Historical Data Point Fields

All historical endpoints return arrays of:

| Field | Type | Description |
|-------|------|-------------|
| `begins_at` | string | ISO 8601 period start |
| `open_price` | string\|null | Open price |
| `close_price` | string\|null | Close price |
| `high_price` | string\|null | High price |
| `low_price` | string\|null | Low price |
| `volume` | number | Period volume |
| `interpolated` | boolean | Whether this point was interpolated |
| `session` | string | Trading session (e.g. `"reg"`, `"pre"`, `"post"`) |

### Interval / Span Compatibility

Not all interval-span combinations are valid:

| Span | Valid Intervals |
|------|-----------------|
| `day` | `5minute`, `10minute` |
| `week` | `10minute`, `hour` |
| `month` | `hour`, `day` |
| `3month` | `day` |
| `year` | `day`, `week` |
| `5year` | `week` |
| `all` | `week` |

### Streaming Historical Candles (dxFeed WebSocket)

The REST historicals endpoint limits 5-minute candles to ~1 week. For deeper history (~6 weeks of 5-minute data), use the dxFeed WebSocket streaming API via `StreamingManager`:

```typescript
import { getClient } from "robinhood-for-agents";
import { getStreamingManager } from "robinhood-for-agents/streaming";

const client = getClient();
await client.restoreSession();

const streaming = getStreamingManager(client._session);

// One-shot: get all available 5-minute candles (~6 weeks)
const candles = await streaming.getHistoricalCandles("NFLX", {
  interval: "5m",
  from: "30d",   // optional: limit to last 30 days
});

// Or subscribe for live updates + backfill
const sub = await streaming.subscribe("NFLX", {
  candles: { interval: "5m" },
  quotes: true,
  trades: true,
});
await sub.waitForBackfill();
console.log(sub.getCandles().length, "candles loaded");
```

The streaming API provides candle data via the dxFeed `Candle` event type with `fromTime` backfill. Available intervals: `1m`, `2m`, `5m`, `30m`, `1h`, `1d`. Server provides ~6 weeks of history for intraday intervals.

#### Subscription Options

`StreamingManager.subscribe(symbol, opts)` accepts:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `candles` | `CandleOptions \| boolean` | — | Candle subscription config or `true` for defaults |
| `candles.interval` | string | `"5m"` | Candle period: `1m`, `2m`, `5m`, `30m`, `1h`, `1d` |
| `candles.from` | `Date \| string` | all available | Start time: Date, `"30d"`, `"24h"` |
| `candles.maxCandles` | number | 5000 | Buffer capacity (oldest evicted first) |
| `quotes` | boolean | false | Subscribe to bid/ask quotes |
| `trades` | `TradeOptions \| boolean` | — | Trade subscription config or `true` for defaults |
| `trades.maxTrades` | number | 500 | Trade buffer capacity |
| `orderBook` | `OrderBookOptions \| boolean` | — | L2 order book subscription |
| `orderBook.maxDepth` | number | 50 | Max levels per side |

#### Subscription Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `waitForBackfill(timeoutMs?)` | `Promise<void>` | Wait for historical candle backfill to complete |
| `getCandles()` | `CandleEvent[]` | All buffered candles, sorted by time |
| `getLatestQuote()` | `QuoteEvent \| null` | Most recent quote |
| `getTrades()` | `TradeEvent[]` | Buffered trades (oldest first) |
| `getOrderBookSnapshot(depth?)` | `OrderBookSnapshot` | L2 book snapshot |
| `on(event, cb)` | void | Push callback: `"candle"`, `"trade"`, `"quote"` |
| `off(event, cb)` | void | Remove callback |
| `setInterval(interval)` | `Promise<void>` | Switch candle timeframe (clears buffer) |
| `unsubscribe()` | void | Clean up all subscriptions |

#### CandleEvent Fields

| Field | Type | Description |
|-------|------|-------------|
| `time` | number | Candle period start (epoch ms) |
| `open` | number | Open price |
| `high` | number | High price |
| `low` | number | Low price |
| `close` | number | Close price |
| `volume` | number | Volume |
| `count` | number | Trade count |
| `vwap` | number | Volume-weighted average price |
| `eventTime` | number | 0 for backfill, real timestamp for live |

---

## 9. Markets & Discovery

### Market Hours

| | |
|---|---|
| **Endpoint** | `GET /markets/` |
| **URL builder** | `urls.markets()` |

| | |
|---|---|
| **Endpoint** | `GET /markets/{market}/hours/{date}/` |
| **URL builder** | `urls.marketHours(market, date)` |

**Response fields (`MarketHours`):**

| Field | Type | Description |
|-------|------|-------------|
| `is_open` | boolean | Whether market is open on this date |
| `opens_at` | string\|null | Regular session open (ISO 8601) |
| `closes_at` | string\|null | Regular session close |
| `extended_opens_at` | string\|null | Pre-market open |
| `extended_closes_at` | string\|null | After-hours close |
| `date` | string | Date (YYYY-MM-DD) |

### Top Movers (S&P 500)

| | |
|---|---|
| **Endpoint** | `GET /midlands/movers/sp500/` |
| **Client method** | `getTopMoversSp500(direction)` |
| **URL builder** | `urls.topMoversSp500()` |
| **Data type** | `results` |

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `direction` | string | `"up"` or `"down"` |

### Top Movers (General)

| | |
|---|---|
| **Endpoint** | `GET /midlands/tags/tag/top-movers/` |
| **Client method** | `getTopMovers()` |
| **URL builder** | `urls.topMovers()` |

Returns `{ instruments: [url1, url2, ...] }`. Each URL is then fetched individually.

### Top 100 Most Popular

| | |
|---|---|
| **Endpoint** | `GET /midlands/tags/tag/100-most-popular/` |
| **Client method** | `getTop100()` |
| **URL builder** | `urls.top100()` |

Returns `{ instruments: [url1, url2, ...] }`.

### Tags / Collections

| | |
|---|---|
| **Endpoint** | `GET /midlands/tags/tag/{tag}/` |
| **Client method** | `getAllStocksFromMarketTag(tag)` |
| **URL builder** | `urls.tags(tag)` |

Examples: `"top-movers"`, `"100-most-popular"`, `"etf"`, `"technology"`, `"healthcare"`, etc.

### Search Instruments

| | |
|---|---|
| **Endpoint** | `GET /instruments/` |
| **Client method** | `findInstruments(query)` |
| **URL builder** | `urls.instruments()` |
| **Data type** | `results` |

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search term (symbol or company name) |

### Indexes

| | |
|---|---|
| **Endpoint** | `GET /indexes/` |
| **Client method** | `getIndexes()` (private, cached) |
| **URL builder** | `urls.indexes()` |
| **Data type** | `results` |

Returns index instruments (SPX, NDX, VIX, RUT, XSP, DJX, etc.) with `tradable_chain_ids` for options lookup.

### Index Values

| | |
|---|---|
| **Endpoint** | `GET /marketdata/indexes/values/v1/` |
| **Client method** | `getIndexValue(symbol)` |
| **URL builder** | `urls.indexValues()` |

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `ids` | string | Index instrument UUID |

**Response fields (`IndexValue`):**

| Field | Type | Description |
|-------|------|-------------|
| `value` | string\|null | Current index value |
| `symbol` | string | Index symbol |
| `instrument_id` | string | Index instrument UUID |
| `updated_at` | string | ISO 8601 last update |

---

## 10. News, Ratings, Earnings

### News

| | |
|---|---|
| **Endpoint** | `GET /midlands/news/{SYMBOL}/` |
| **Client method** | `getNews(symbol)` |
| **URL builder** | `urls.news(symbol)` |
| **Data type** | `results` |

**Response fields (`News`):**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Headline |
| `source` | string | Publisher name |
| `published_at` | string | ISO 8601 publish time |
| `url` | string | Article URL |
| `summary` | string | Article summary/snippet |
| `preview_image_url` | string\|null | Thumbnail image URL |
| `relay_url` | string | Robinhood relay URL |
| `api_source` | string | API source identifier |

### Analyst Ratings

| | |
|---|---|
| **Endpoint** | `GET /midlands/ratings/{instrumentId}/` |
| **Client method** | `getRatings(symbol)` (resolves instrument ID internally) |
| **URL builder** | `urls.ratings(instrumentId)` |

**Response fields (`Rating`):**

| Field | Type | Description |
|-------|------|-------------|
| `summary.num_buy_ratings` | number | Buy rating count |
| `summary.num_hold_ratings` | number | Hold rating count |
| `summary.num_sell_ratings` | number | Sell rating count |
| `ratings[].published_at` | string | Rating date |
| `ratings[].type` | string | `"buy"`, `"hold"`, `"sell"` |
| `ratings[].text` | string | Analyst commentary |
| `instrument_id` | string | Instrument UUID |

### Earnings

| | |
|---|---|
| **Endpoint** | `GET /marketdata/earnings/` |
| **Client method** | `getEarnings(symbol)` |
| **URL builder** | `urls.earnings()` |
| **Data type** | `results` |

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Ticker symbol |

**Response fields (`Earnings`):**

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Ticker symbol |
| `report.date` | string | Report date |
| `report.timing` | string | `"am"` (before open) or `"pm"` (after close) |
| `report.verified` | boolean | Whether the date is confirmed |
| `estimate` | string\|null | Consensus EPS estimate |
| `actual` | string\|null | Actual EPS (post-report) |
| `year` | number | Fiscal year |
| `quarter` | number | Fiscal quarter (1-4) |

---

## 11. Instruments & Fundamentals

### Get Instrument by ID

| | |
|---|---|
| **Endpoint** | `GET /instruments/{instrumentId}/` |
| **URL builder** | `urls.instrument(instrumentId)` |

### Get Instrument by URL

| | |
|---|---|
| **Client method** | `getInstrumentByUrl(url)` |

Validates that the URL is within `api.robinhood.com` before fetching.

**Response fields (`Instrument`):**

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Self URL |
| `id` | string | Instrument UUID |
| `symbol` | string | Ticker symbol |
| `simple_name` | string\|null | Simplified display name |
| `name` | string | Full legal name |
| `type` | string | e.g. `"stock"`, `"adr"`, `"etp"` |
| `tradability` | string | e.g. `"tradable"` |
| `tradeable` | boolean | Whether currently tradable |
| `country` | string | Country code |
| `market` | string | Market URL |

### Get Fundamentals (Batch)

| | |
|---|---|
| **Endpoint** | `GET /fundamentals/?symbols={sym}` |
| **Client method** | `getFundamentals(symbols)` |
| **URL builder** | `urls.fundamentals()` |
| **Data type** | `results` |

### Get Fundamentals (Single)

| | |
|---|---|
| **Endpoint** | `GET /fundamentals/{SYMBOL}/` |
| **URL builder** | `urls.fundamental(symbol)` |

**Response fields (`Fundamental`):**

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Ticker symbol |
| `pe_ratio` | string\|null | Price-to-earnings ratio |
| `dividend_yield` | string\|null | Dividend yield (decimal) |
| `market_cap` | string\|null | Market capitalization |
| `high` | string\|null | 52-week high |
| `low` | string\|null | 52-week low |
| `high_52_weeks` | string\|null | 52-week high |
| `low_52_weeks` | string\|null | 52-week low |
| `average_volume` | string\|null | Average daily volume |
| `average_volume_2_weeks` | string\|null | 2-week average volume |
| `shares_outstanding` | string\|null | Shares outstanding |
| `description` | string\|null | Company description |
| `ceo` | string\|null | CEO name |
| `headquarters_city` | string\|null | HQ city |
| `headquarters_state` | string\|null | HQ state |
| `sector` | string\|null | GICS sector |
| `industry` | string\|null | GICS industry |
| `num_employees` | number\|null | Employee count |
| `year_founded` | number\|null | Year founded |

### Get Quote (Single)

| | |
|---|---|
| **Endpoint** | `GET /quotes/{SYMBOL}/` |
| **URL builder** | `urls.quote(symbol)` |

### Get Quotes (Batch)

| | |
|---|---|
| **Endpoint** | `GET /quotes/?symbols={sym}` |
| **Client method** | `getQuotes(symbols)` |
| **URL builder** | `urls.quotes()` |
| **Data type** | `results` |

**Response fields (`Quote`):**

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Ticker symbol |
| `last_trade_price` | string\|null | Last trade price |
| `ask_price` | string\|null | Current ask |
| `bid_price` | string\|null | Current bid |
| `adjusted_previous_close` | string\|null | Split-adjusted previous close |
| `previous_close` | string\|null | Previous close |
| `pe_ratio` | string\|null | P/E ratio |
| `last_extended_hours_trade_price` | string\|null | Extended-hours last trade |
| `trading_halted` | boolean | Whether trading is halted |
| `has_traded` | boolean | Whether the stock has traded today |
| `updated_at` | string | ISO 8601 last update |

---

## 12. Undocumented / HAR-Only Endpoints

These endpoints were observed in network traffic from the Robinhood web UI but are **not implemented** in `robinhood-for-agents`. They are documented here for completeness.

### Short Sale Restriction (SSR)

| | |
|---|---|
| **Endpoint** | `GET /marketdata/equities/ssr/v1/` |
| **Query params** | `ids={instrument_id}` |
| **Purpose** | Check if a stock is on the SSR list (Rule 201) |

### Short Selling Availability

| | |
|---|---|
| **Endpoint** | `GET /instruments/{instrumentId}/shorting/` |
| **Purpose** | Short selling availability and borrow rates |

### Pre-Order Validation

| | |
|---|---|
| **Endpoint** | `GET /orders/order_checks/presubmit_data/` |
| **Query params** | `account_number={acct}&instrument={id}` |
| **Purpose** | Validates order parameters before submission (position limits, restrictions) |

### Buying Power Breakdown

| | |
|---|---|
| **Endpoint** | `GET /accounts/{acct}/buying_power_breakdown` |
| **Purpose** | Detailed buying power split (cash, margin, options BP, etc.) |

### Pattern Day Trade (PDT) Tracking

| | |
|---|---|
| **Endpoint** | `GET /accounts/{acct}/recent_day_trades/` |
| **Purpose** | Lists recent day trades for PDT rule monitoring |

### Portfolio Performance Summary

| | |
|---|---|
| **Endpoint** | `GET /portfolios/v2/performance/summary` |
| **Purpose** | Performance metrics (returns, benchmarks) |

### Fundamentals via Marketdata

| | |
|---|---|
| **Endpoint** | `GET /marketdata/fundamentals/{instrumentId}/` |
| **Query params** | `include_inactive=true` |
| **Purpose** | Alternative fundamentals endpoint (by instrument ID, not symbol) |

### Futures (Ceres)

| Endpoint | Purpose |
|----------|---------|
| `GET /ceres/v1/accounts` | Futures account info |
| `GET /ceres/v1/futures_pnl` | Futures P&L |
| `GET /arsenal/v1/futures/products` | Available futures products |

### Bonfire Services (`bonfire.robinhood.com`)

Web UI services:

| Path Pattern | Purpose |
|-------------|---------|
| `/alerts/` | Price/event alerts |
| `/banners/` | UI banner messages |
| `/options_upgrade/` | Options level upgrade prompts |
| `/crypto_ability/` | Crypto trading eligibility |

### Identity Services (`identi.robinhood.com`)

| Path Pattern | Purpose |
|-------------|---------|
| `/address/` | Address verification |
| `/suitability/` | Investment suitability |
| `/privacy_consent/` | Privacy consent tracking |

### A/B Test Flags (Streaming-Related)

These feature flags were observed in the web UI and control streaming behavior:

| Flag | Purpose |
|------|---------|
| `bw-dxfeed-subscription-cache-cleanup` | Cleanup of stale dxFeed subscriptions |
| `bw-dxfeed-timeout-measurement` | Telemetry for subscription timeouts |
| `bw-md-streaming-client` | Streaming client variant selection |
| `bw-md-streaming-client-logging` | Debug logging for streaming |
| `bw-ladder-perf-prefetch-order-book` | Pre-fetch order book data |
| `bw-ladder-perf-incremental-binning` | Incremental price level binning |

---

## API Domains Summary

| Domain | Protocol | Auth | Purpose |
|--------|----------|------|---------|
| `api.robinhood.com` | HTTPS REST | Bearer token | Primary API (equities, options, accounts, market data, orders) |
| `api.robinhood.com` | WSS | Streaming token | dxLink WebSocket (real-time quotes, trades, order book) |
| `nummus.robinhood.com` | HTTPS REST | Bearer token | Crypto (pairs, orders, holdings, accounts) |
| `bonfire.robinhood.com` | HTTPS REST | Bearer token | Web UI services (alerts, banners, feature flags) |
| `identi.robinhood.com` | HTTPS REST | Bearer token | Identity verification and privacy |
| `robinhood.com` | HTTPS | Session cookie | Web login (browser auth) |

**Important:** Never use `phoenix.robinhood.com` -- it rejects TLS connections.

---

## Pagination

Robinhood uses cursor-based pagination across most list endpoints:

```json
{
  "results": [...],
  "next": "https://api.robinhood.com/endpoint/?cursor=cD1...",
  "previous": null
}
```

The `requestGet()` helper with `dataType: "pagination"` automatically follows `next` links until exhausted. All `next` URLs are validated against trusted origins (`api.robinhood.com`, `nummus.robinhood.com`) before following.

## Data Types

All prices and quantities are returned as **strings** (not numbers) for fixed-precision accuracy. Parse them with `parseFloat()` or a decimal library when performing calculations.

## Error Handling

| HTTP Status | Error Class | Description |
|-------------|-------------|-------------|
| 401 | `AuthenticationError` | Token expired or invalid |
| 404 | `NotFoundError` | Resource not found |
| 429 | `RateLimitError` | Rate limited |
| Other 4xx/5xx | `APIError` | General API error |

Streaming-specific errors:

| Error Class | Description |
|-------------|-------------|
| `StreamingAuthError` | Failed to acquire streaming token |
| `StreamingConnectionError` | WebSocket connection failed |
| `StreamingProtocolError` | Unexpected protocol message or timeout |

## HTTP Safety

- All redirects are followed manually and validated against trusted origins.
- Default request timeout: 16 seconds.
- Session follows at most 5 redirects.
- All response bodies in error messages are scrubbed of sensitive keys (tokens, credentials).

---

## Client Method Quick Reference

| Method | Endpoint | Section |
|--------|----------|---------|
| `restoreSession()` | `POST /oauth2/token/` | [1](#1-authentication) |
| `logout()` | `POST /oauth2/revoke_token/` | [1](#1-authentication) |
| `getAccounts()` | `GET /accounts/` | [2](#2-account--portfolio) |
| `getAccountProfile()` | `GET /accounts/{acct}/` | [2](#2-account--portfolio) |
| `getPortfolioProfile()` | `GET /portfolios/` | [2](#2-account--portfolio) |
| `getUserProfile()` | `GET /user/` | [2](#2-account--portfolio) |
| `getInvestmentProfile()` | `GET /user/investment_profile/` | [2](#2-account--portfolio) |
| `getPositions()` | `GET /positions/` | [2](#2-account--portfolio) |
| `buildHoldings()` | Multiple | [2](#2-account--portfolio) |
| `getQuotes()` | `GET /quotes/` | [11](#11-instruments--fundamentals) |
| `getLatestPrice()` | `GET /quotes/` | [11](#11-instruments--fundamentals) |
| `getFundamentals()` | `GET /fundamentals/` | [11](#11-instruments--fundamentals) |
| `getStockHistoricals()` | `GET /quotes/historicals/` | [8](#8-historical-data) |
| `getNews()` | `GET /midlands/news/{sym}/` | [10](#10-news-ratings-earnings) |
| `getRatings()` | `GET /midlands/ratings/{id}/` | [10](#10-news-ratings-earnings) |
| `getEarnings()` | `GET /marketdata/earnings/` | [10](#10-news-ratings-earnings) |
| `getIndexValue()` | `GET /marketdata/indexes/values/v1/` | [9](#9-markets--discovery) |
| `getChains()` | `GET /options/chains/` | [6](#6-options-trading) |
| `findTradableOptions()` | `GET /options/instruments/` | [6](#6-options-trading) |
| `getOptionMarketData()` | `GET /marketdata/options/{id}/` | [6](#6-options-trading) |
| `orderStock()` | `POST /orders/` | [5](#5-stock-trading) |
| `cancelStockOrder()` | `POST /orders/{id}/cancel/` | [5](#5-stock-trading) |
| `getAllStockOrders()` | `GET /orders/` | [5](#5-stock-trading) |
| `getStockOrder()` | `GET /orders/{id}/` | [5](#5-stock-trading) |
| `orderOption()` | `POST /options/orders/` | [6](#6-options-trading) |
| `cancelOptionOrder()` | `POST /options/orders/{id}/cancel/` | [6](#6-options-trading) |
| `getAllOptionOrders()` | `GET /options/orders/` | [6](#6-options-trading) |
| `getOptionOrder()` | `GET /options/orders/{id}/` | [6](#6-options-trading) |
| `getCryptoQuote()` | `GET /marketdata/forex/quotes/{id}/` | [7](#7-crypto-trading) |
| `getCryptoHistoricals()` | `GET /marketdata/forex/historicals/{id}/` | [8](#8-historical-data) |
| `getCryptoPositions()` | `GET /holdings/` (nummus) | [7](#7-crypto-trading) |
| `orderCrypto()` | `POST /orders/` (nummus) | [7](#7-crypto-trading) |
| `cancelCryptoOrder()` | `POST /orders/{id}/cancel/` (nummus) | [7](#7-crypto-trading) |
| `getAllCryptoOrders()` | `GET /orders/` (nummus) | [7](#7-crypto-trading) |
| `getCryptoOrder()` | `GET /orders/{id}/` (nummus) | [7](#7-crypto-trading) |
| `getTopMovers()` | `GET /midlands/tags/tag/top-movers/` | [9](#9-markets--discovery) |
| `getTopMoversSp500()` | `GET /midlands/movers/sp500/` | [9](#9-markets--discovery) |
| `getTop100()` | `GET /midlands/tags/tag/100-most-popular/` | [9](#9-markets--discovery) |
| `findInstruments()` | `GET /instruments/` | [9](#9-markets--discovery) |
| `getAllStocksFromMarketTag()` | `GET /midlands/tags/tag/{tag}/` | [9](#9-markets--discovery) |
| `getInstrumentByUrl()` | `GET {instrument_url}` | [11](#11-instruments--fundamentals) |
