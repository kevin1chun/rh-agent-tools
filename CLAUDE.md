# rh-for-agents

AI-native Robinhood trading interface — single npm package with MCP server + TypeScript client.

## Project Structure
- `src/client/` — Robinhood API client (~50 async methods)
- `src/server/` — MCP server with 18 tools
- `bin/` — CLI entry point (`rh-for-agents`)
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
bun bin/rh-for-agents.ts
```

## Development
```bash
bun run typecheck   # tsc --noEmit
bun run check       # biome lint + format
npx vitest run      # all tests (use vitest, NOT bun test)
```

## Skills
Canonical skill source is `skills/`. Local `.claude/skills/` contains symlinks for development.

Install MCP server + skills: `bun bin/rh-for-agents.ts install`

Skills use three-layer progressive disclosure:
1. **SKILL.md** — MCP tool orchestration (default)
2. **reference.md** — MCP tool API details (loaded on demand)
3. **client-api.md** — TypeScript client library patterns (advanced, loaded on demand)

Available skills:
- `robinhood-setup` - Initial auth setup
- `robinhood-portfolio` - Portfolio and holdings
- `robinhood-research` - Stock research and analysis
- `robinhood-trade` - Order placement with safety checks
- `robinhood-options` - Options chain analysis

## Client Patterns
```typescript
import { RobinhoodClient, getClient } from "rh-for-agents";

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
- Session cached to `~/.rh-for-agents/session.enc` (AES-256-GCM, key in OS keychain)
- Token refresh via `refresh_token` + `device_token` when access token expires
- Proper exceptions: `AuthenticationError`, `APIError`
- **Do NOT use `phoenix.robinhood.com`** — it rejects TLS. Use `api.robinhood.com` endpoints only.

## Authentication
- Browser login (`robinhood_browser_login`) opens system Chrome via playwright-core
- Purely passive — Playwright intercepts `/oauth2/token` network traffic, never interacts with the DOM
- Request body (JSON) → captures `device_token`; Response → captures `access_token` + `refresh_token`
- Tokens encrypted with AES-256-GCM, key stored in OS keychain (never on disk)
- `restoreSession()` validates cached token, falls back to refresh, then directs to browser login

## Safety Rules
- **NEVER** place bulk cancel operations
- **NEVER** call fund transfer functions
- **ALWAYS** confirm with user before placing any order
- Order tools require explicit parameters - no defaults that could cause accidental trades

## Testing
```bash
npx vitest run
```
Tests use `vi.mock()` to mock HTTP layer — no real API calls. Use `vitest` (not `bun test`) for correct module isolation.
