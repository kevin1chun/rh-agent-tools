# robinhood-for-agents

AI-native Robinhood trading interface — polyglot monorepo with TypeScript + Python SDKs.

## Monorepo Structure
- `typescript/` — TypeScript SDK: MCP server + client library (npm: `robinhood-for-agents`)
- `python/` — Python SDK: async client library (PyPI: `robinhood-for-agents`)
- `docs/` — Shared documentation

## TypeScript SDK (`typescript/`)

### Project Structure
- `typescript/src/client/` — Robinhood API client (~50 async methods)
- `typescript/src/server/` — MCP server with 18 tools
- `typescript/bin/` — CLI entry point (`robinhood-for-agents`)
- `typescript/skills/` — Claude Code skills for interactive use

### Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ESM-only)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.12+ (McpServer + StdioServerTransport)
- **Validation**: Zod v3.24 (API responses + MCP tool schemas)
- **Testing**: Vitest (not `bun test` — module isolation matters)
- **Linting**: Biome v2
- **Browser Auth**: playwright-core (drives system Chrome, no bundled browser)

### Running the MCP Server
```bash
cd typescript && bun install
bun bin/robinhood-for-agents.ts
```

### Development
```bash
cd typescript
bun run typecheck   # tsc --noEmit
bun run check       # biome lint + format
npx vitest run      # all tests (use vitest, NOT bun test)
```

### Skills
Canonical skill source is `typescript/skills/`. Local `.claude/skills/` contains symlinks for development.

Install MCP server + skills: `bun typescript/bin/robinhood-for-agents.ts install`

Skills use three-layer progressive disclosure:
1. **SKILL.md** — MCP tool orchestration (default)
2. **reference.md** — MCP tool API details (loaded on demand)
3. **client-api.md** — TypeScript client library patterns (advanced, loaded on demand)

Available skills:
- `robinhood-for-agents` - Unified skill: auth, portfolio, research, trading, options (dual-mode: MCP + client API)

### Client Patterns
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

## Python SDK (`python/`)

### Tech Stack
- **Python**: >=3.12 (PEP 695 generics, `type` statement, `@override`)
- **HTTP**: httpx (async)
- **Validation**: Pydantic v2
- **Auth**: proxy-only (auto-discovers TS auth proxy at `127.0.0.1:3100`)
- **Testing**: pytest + pytest-asyncio + respx
- **Linting**: ruff
- **Type Checking**: mypy --strict

### Development
```bash
cd python
uv sync --all-extras   # install deps
uv run ruff check .    # lint
uv run mypy src/       # type check
uv run pytest          # test
```

### Client Patterns
```python
from robinhood_agents import RobinhoodClient

async with RobinhoodClient() as client:
    await client.restore_session()
    quotes = await client.get_quotes("AAPL")
```
- All methods are `async` (httpx under the hood)
- Async-only — target users are AI agents
- Shares auth proxy with TypeScript SDK — login once, use from either language

## Authentication
- Browser login (`robinhood_browser_login`) opens a Chromium-based browser via playwright-core. On macOS, Brave and Chrome are auto-detected; otherwise use `BROWSER_PATH` or `robinhood-for-agents login --chrome /path/to/browser`.
- Purely passive — Playwright intercepts `/oauth2/token` network traffic, never interacts with the DOM
- Request body (JSON) → captures `device_token`; Response → captures `access_token` + `refresh_token`
- Tokens stored directly in OS keychain via `Bun.secrets` (never on disk)
- `restoreSession()` validates cached token, falls back to refresh, then directs to browser login
- **Docker / OpenClaw:** Container cannot access the host keychain. Run an auth proxy on the host (`robinhood-for-agents proxy`) that injects auth headers; the container only needs `ROBINHOOD_API_PROXY` env var. **Never put tokens or encryption keys inside the container.** See `docs/DOCKER.md` and `docs/SECURITY.md`.
- **Python SDK:** Connects to the same auth proxy. Auto-discovers at `127.0.0.1:3100`, or uses `ROBINHOOD_API_PROXY` env var. Does NOT access the keychain directly — all auth is proxy-mediated.

## Safety Rules
- **NEVER** place bulk cancel operations
- **NEVER** call fund transfer functions
- **ALWAYS** confirm with user before placing any order
- Order tools require explicit parameters - no defaults that could cause accidental trades
- **NEVER** use real PII in code, docs, examples, or commit messages — this includes account numbers, tokens, device IDs, email addresses, and any other user-identifying data. Use placeholders like `"ACCOUNT_ID"`, `"xxx-token"`, etc.

## Testing
```bash
# TypeScript
cd typescript && npx vitest run

# Python
cd python && uv run pytest
```
Tests use mocking (vi.mock / respx) for HTTP layer — no real API calls.

### Integration Tests (local only, requires auth proxy)
```bash
# Start the proxy first
robinhood-for-agents proxy

# TypeScript
cd typescript && bun run test:integration

# Python
cd python && uv run pytest -m integration
```
Integration tests hit the real Robinhood API (read-only). They are excluded from CI and default test runs.

## Releases
- TypeScript: tag `ts-v*` → publishes to npm
- Python: tag `py-v*` → publishes to PyPI
