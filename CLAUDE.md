# robinhood-for-agents

AI-native Robinhood trading interface — single npm package with MCP server + TypeScript client.

## Project Structure
- `src/client/` — Robinhood API client (~50 async methods)
- `src/server/` — MCP server with 18 tools
- `bin/` — CLI entry point (`robinhood-for-agents`)
- `skills/` — Claude Code skills for interactive use
- `docs/` — Architecture, access controls, use cases, contributing

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ESM-only)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.12+ (McpServer + StdioServerTransport)
- **Validation**: Zod v3.24 (API responses + MCP tool schemas)
- **Testing**: Vitest (not `bun test` — module isolation matters)
- **Linting**: Biome v2
- **Browser Auth**: playwright-core (drives system Chrome, no bundled browser)

## Running the MCP Server
```bash
bun install
bun bin/robinhood-for-agents.ts
```

## Development
```bash
bun run typecheck   # tsc --noEmit
bun run check       # biome lint + format
npx vitest run      # all tests (use vitest, NOT bun test)
```

## Skills
Canonical skill source is `skills/`. Local `.claude/skills/` contains symlinks for development.

Install MCP server + skills: `bun bin/robinhood-for-agents.ts install`

Skills use three-layer progressive disclosure:
1. **SKILL.md** — MCP tool orchestration (default)
2. **reference.md** — MCP tool API details (loaded on demand)
3. **client-api.md** — TypeScript client library patterns (advanced, loaded on demand)

Available skills:
- `robinhood-for-agents` - Unified skill: auth, portfolio, research, trading, options (dual-mode: MCP + client API)

## Client Patterns
```typescript
import { RobinhoodClient, getClient } from "robinhood-for-agents";

// Class-based
const client = new RobinhoodClient();
await client.restoreSession();
const quotes = await client.getQuotes("AAPL");

// Singleton
const rh = getClient();
await rh.restoreSession();
```
- All methods are `async` (native `fetch` under the hood)
- Multi-account is first-class: every account-scoped method accepts `accountNumber`
- Session cached in OS keychain via `Bun.secrets` (macOS Keychain Services) — no plaintext fallback, no tokens on disk
- Token refresh via `refresh_token` + `device_token` when access token expires
- Proper exceptions: `AuthenticationError`, `APIError`
- **Do NOT use `phoenix.robinhood.com`** — it rejects TLS. Use `api.robinhood.com` endpoints only.

## Streaming (dxFeed WebSocket)
```typescript
import { getStreamingManager } from "robinhood-for-agents/streaming";

const streaming = getStreamingManager(client._session);

// One-shot: get ~6 weeks of 5-minute candle history
const candles = await streaming.getHistoricalCandles("NFLX", {
  interval: "5m",  // 1m, 2m, 5m, 30m, 1h, 1d
  from: "30d",     // Date, "30d", "24h", or omit for all available
});

// Live subscription with configurable buffers
const sub = await streaming.subscribe("NFLX", {
  candles: { interval: "5m", maxCandles: 5000 },
  quotes: true,
  trades: { maxTrades: 500 },
  orderBook: { maxDepth: 50 },
});
await sub.waitForBackfill();
sub.on("candle", (c) => console.log(c));
sub.getCandles();       // CandleEvent[]
sub.getLatestQuote();   // QuoteEvent | null
sub.getTrades();        // TradeEvent[]
await sub.setInterval("1h");  // switch timeframe
sub.unsubscribe();
```
- Data comes from Robinhood's dxLink WebSocket (`wss://api.robinhood.com/marketdata/streaming/legend/v2/`)
- ~6 weeks of intraday candle backfill (far more than REST API's ~1 week)
- Buffers are bounded with configurable caps and silent oldest-first eviction
- `StreamingManager` handles connection, reconnection, and subscription lifecycle
- One shared WebSocket for all subscriptions (candles, quotes, trades, order book)

## Authentication
- Browser login (`robinhood_browser_login`) opens a Chromium-based browser via playwright-core. On macOS, Brave and Chrome are auto-detected; otherwise use `BROWSER_PATH` or `robinhood-for-agents login --chrome /path/to/browser`.
- Purely passive — Playwright intercepts `/oauth2/token` network traffic, never interacts with the DOM
- Request body (JSON) → captures `device_token`; Response → captures `access_token` + `refresh_token`
- Tokens stored directly in OS keychain via `Bun.secrets` (never on disk)
- `restoreSession()` validates cached token, falls back to refresh, then directs to browser login

## Safety Rules
- **NEVER** place bulk cancel operations
- **NEVER** call fund transfer functions
- **ALWAYS** confirm with user before placing any order
- Order tools require explicit parameters - no defaults that could cause accidental trades
- **NEVER** use real PII in code, docs, examples, or commit messages — this includes account numbers, tokens, device IDs, email addresses, and any other user-identifying data. Use placeholders like `"ACCOUNT_ID"`, `"xxx-token"`, etc.

## Testing
```bash
npx vitest run
```
Tests use `vi.mock()` to mock HTTP layer — no real API calls. Use `vitest` (not `bun test`) for correct module isolation.
