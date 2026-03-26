# robinhood-for-agents

[![CI](https://github.com/TajiAI/robinhood-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/TajiAI/robinhood-for-agents/actions/workflows/ci.yml)
[![GitHub Package](https://img.shields.io/github/v/release/TajiAI/robinhood-for-agents?label=package)](https://github.com/TajiAI/robinhood-for-agents/packages)
[![ClawHub](https://img.shields.io/badge/ClawHub-robinhood--for--agents-blue)](https://clawhub.ai/kevin1chun/robinhood-for-agents)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

Robinhood for AI agents — an MCP server with 18 structured tools and a standalone TypeScript client, in a single package.

- **18 MCP tools** for any MCP-compatible AI agent
- **Unified trading skill** for guided workflows (Claude Code, OpenClaw, [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents))
- **Standalone API client** (~50 async methods) for programmatic use

Compatible with **Claude Code**, **Codex**, **OpenClaw**, and any MCP-compatible agent.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Google Chrome (used by `playwright-core` for browser-based login — no bundled browser)
- A Robinhood account

## Quick Start

### Guided setup (recommended)

```bash
# Requires Bun runtime — see Prerequisites
npx robinhood-for-agents onboard
```

The interactive setup detects your agent, registers the MCP server, installs skills (where supported), and walks you through Robinhood login.

You can also specify your agent directly:

```bash
robinhood-for-agents onboard --agent claude-code
robinhood-for-agents onboard --agent codex
robinhood-for-agents onboard --agent openclaw
```

### From source

```bash
git clone https://github.com/TajiAI/robinhood-for-agents.git
cd robinhood-for-agents
bun install
bun bin/robinhood-for-agents.ts onboard
```

### Manual setup

<details>
<summary>Claude Code</summary>

```bash
# Register MCP server (global — available in all projects)
claude mcp add -s user robinhood-for-agents -- bun run /path/to/bin/robinhood-for-agents.ts

# Install skills (per-project, optional)
cd your-project
robinhood-for-agents install --skills
```

Restart Claude Code to pick up the changes. Claude Code supports the unified trading skill in addition to the 18 MCP tools — see [Skill](#skill).
</details>

<details>
<summary>Codex</summary>

```bash
codex mcp add robinhood-for-agents -- bun run /path/to/bin/robinhood-for-agents.ts
```

Restart Codex to pick up the changes. Codex uses all 18 MCP tools directly.
</details>

<details>
<summary>OpenClaw</summary>

**Via ClawHub (recommended):**
```bash
clawhub install robinhood-for-agents
```

**Via onboard CLI:**
```bash
robinhood-for-agents onboard --agent openclaw
```

Both install the unified `robinhood-for-agents` skill to `~/.openclaw/workspace/skills/`. No MCP server required — the skill uses the TypeScript client API directly via `bun`.

</details>

<details>
<summary>Other MCP clients (Claude Desktop, etc.)</summary>

Add to your MCP client's config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "robinhood-for-agents": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/robinhood-for-agents/bin/robinhood-for-agents.ts"]
    }
  }
}
```
</details>

## Example

> "Buy 1 50-delta SPX call expiring tomorrow"

![SPX options chain with greeks and order summary](docs/images/spx-options-example.png)

## Authenticate

Start your agent and say "setup robinhood" (or call `robinhood_browser_login` directly). Chrome will open to the real Robinhood login page — log in with your credentials and MFA. The session is cached and auto-restores for ~24 hours.

## MCP Tools (18)

All 18 tools work with every MCP-compatible agent.

| Tool | Description |
|------|-------------|
| `robinhood_browser_login` | Authenticate via Chrome browser |
| `robinhood_check_session` | Check if cached session is valid |
| `robinhood_get_portfolio` | Portfolio: positions, P&L, equity, cash |
| `robinhood_get_accounts` | List all brokerage accounts |
| `robinhood_get_account` | Account details and profile |
| `robinhood_get_stock_quote` | Stock quotes and fundamentals |
| `robinhood_get_historicals` | OHLCV price history |
| `robinhood_get_news` | News, analyst ratings, earnings |
| `robinhood_get_movers` | Market movers and popular stocks |
| `robinhood_get_options` | Options chain with greeks |
| `robinhood_get_crypto` | Crypto quotes, history, positions |
| `robinhood_place_stock_order` | Place stock orders (market/limit/stop/trailing) |
| `robinhood_place_option_order` | Place option orders |
| `robinhood_place_crypto_order` | Place crypto orders |
| `robinhood_get_orders` | View order history |
| `robinhood_cancel_order` | Cancel an order by ID |
| `robinhood_get_order_status` | Get status of a specific order by ID |
| `robinhood_search` | Search stocks or browse categories |

## Skill

A single unified skill (`robinhood-for-agents`) provides guided workflows for auth, portfolio, research, trading, and options. Available on [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents) and supported by **Claude Code** and **OpenClaw**.

```bash
# Install via ClawHub
clawhub install robinhood-for-agents
```

| Domain | Example Triggers |
|--------|-----------------|
| Setup | "setup robinhood", "connect to robinhood" |
| Portfolio | "show my portfolio", "my holdings" |
| Research | "research AAPL", "analyze TSLA" |
| Trading | "buy 10 AAPL", "sell my position" |
| Options | "show AAPL options", "SPX calls" |

**Dual-mode:** The skill works with MCP tools (Claude Code) or standalone via the TypeScript client API and `bun` (OpenClaw, any agent with shell access). No MCP server required.

The skill uses progressive disclosure — `SKILL.md` is the compact router, with domain-specific files (`portfolio.md`, `trade.md`, etc.) and a full `client-api.md` reference loaded on demand.

## Agent Compatibility

| Feature | Claude Code | Codex | OpenClaw | Other MCP |
|---------|:-----------:|:-----:|:--------:|:---------:|
| 18 MCP tools | Yes | Yes | — | Yes |
| Trading skill | Yes | — | Yes | — |
| ClawHub install | — | — | Yes | — |
| `onboard` setup | Yes | Yes | Yes | — |
| Browser auth | Yes | Yes | Yes | Yes |

## Client Library (standalone)

```typescript
import { RobinhoodClient } from "robinhood-for-agents";

const client = new RobinhoodClient();
await client.restoreSession();

const quotes = await client.getQuotes("AAPL");
const portfolio = await client.buildHoldings();
```

## Safety

- **Tokens are never exposed to the AI agent** — authentication is handled entirely within the MCP server process; the agent only sees tool results, never access tokens or credentials
- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- All order placements require explicit parameters (no dangerous defaults)
- Skills always confirm with the user before placing orders
- See [ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk matrix

## Authentication

**MCP**: Call `robinhood_browser_login` to open Chrome and log in (works with all agents). After that, all tools auto-restore the cached session.

**Skills**: Say "setup robinhood" to trigger the guided browser login (Claude Code and OpenClaw).

### Full Auth Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  robinhood_browser_login              restoreSession()                  │
│  (first-time / expired)               (every tool call)                │
│          │                                    │                         │
│          ▼                                    ▼                         │
│  ┌───────────────────┐               loadTokens()                      │
│  │ Playwright launches│               Bun.secrets.get() from           │
│  │ system Chrome      │               OS keychain                      │
│  │ (headless: false)  │               (macOS Keychain Services)        │
│  └────────┬──────────┘                        │                        │
│           │                                   │                         │
│           ▼                                   ▼                         │
│  ┌───────────────────┐               Set Authorization header          │
│  │ Navigate to        │               Validate: GET /positions/        │
│  │ robinhood.com/login│                       │                         │
│  └────────┬──────────┘                  ┌─────┴─────┐                  │
│           │                           Valid?      Invalid?             │
│           ▼                             │           │                   │
│  ┌───────────────────┐            return        ┌──┘                   │
│  │ User logs in       │           "cached"       │                      │
│  │ (email, password,  │                          ▼                      │
│  │  MFA push/SMS)     │              POST /oauth2/token/               │
│  └────────┬──────────┘              (grant_type: refresh_token,        │
│           │                          expires_in: 734000)               │
│           ▼                                 │                           │
│  ┌───────────────────────────┐       ┌──────┴──────┐                   │
│  │ Robinhood frontend calls   │    Success?      Failure?             │
│  │ POST /oauth2/token         │       │              │                  │
│  │                            │  saveTokens()     throw                │
│  │ Playwright intercepts:     │  return          AuthError             │
│  │  request  → device_token   │  "refreshed"     "Use browser_login"  │
│  │  response → access_token,  │                                        │
│  │             refresh_token   │                                        │
│  └────────┬──────────────────┘                                         │
│           │                                                             │
│           ▼                                                             │
│  saveTokens() ──► token-store.ts                                       │
│           │       Bun.secrets.set() → OS keychain                      │
│           │       (tokens never written to disk)                       │
│           │                                                            │
│           │                                                             │
│           ▼                                                             │
│  restoreSession() ──► client ready                                     │
│  getAccountProfile() → account_hint                                    │
│  Close browser                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The left path is the initial login (browser-based, user-interactive). The right path is the session restore (automatic, every tool call). When the cached access token is invalid, it attempts a silent refresh using the stored `refresh_token` (with `expires_in: 734000` ~8.5 days). If refresh also fails, the user is directed back to browser login.

### Why Browser-Based Auth

The browser login is purely passive — Playwright never clicks buttons, fills forms, or predicts the login flow. It opens a real Chrome window, the user completes login entirely on their own (including whatever MFA Robinhood requires), and Playwright only intercepts the network traffic:

- `page.on("request")` captures `device_token` from POST body to `/oauth2/token`
- `page.on("response")` captures `access_token` + `refresh_token` from the 200 response

This design is resilient to Robinhood UI changes — it doesn't depend on any DOM selectors, page structure, or login step ordering. As long as the OAuth token endpoint exists, the interception works. `playwright-core` is used (not `playwright`) so no browser binary is bundled — it drives the user's system Chrome.

### Encrypted Token Storage

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
│  Bun.secrets.set("robinhood-for-agents", "session-tokens", json)         │
│  → OS encrypts and stores in keychain                              │
│  → No file written to disk                                         │
│                                                                    │
│                                                                    │
│  LOAD                                                              │
│  ────                                                              │
│  Bun.secrets.get("robinhood-for-agents", "session-tokens")               │
│         │                                                          │
│         ▼                                                          │
│  JSON.parse() → TokenData                                          │
│                                                                    │
│                                                                    │
│  STORAGE                                                           │
│  ───────                                                           │
│  OS Keychain via Bun.secrets (no plaintext fallback)               │
│  ├── macOS: Keychain Services                                      │
│  ├── Linux: libsecret (GNOME Keyring, KWallet)                    │
│  └── Windows: Credential Manager                                   │
│  Tokens never touch the filesystem.                                │
└────────────────────────────────────────────────────────────────────┘
```

`Bun.secrets` stores tokens directly in the OS keychain — no intermediate encryption layer needed since the keychain itself provides encryption, access control, and tamper resistance. There is no plaintext fallback; `Bun.secrets` is required.

Critically, **the AI agent never sees authentication tokens**. Token storage and HTTP authorization happen entirely within the MCP server process. The agent only receives structured tool results (quotes, positions, order confirmations) — never raw tokens, headers, or credentials. Even if the agent's conversation is logged or leaked, no secrets are exposed.

## Development

```bash
bun install                    # Install deps
bun run typecheck              # tsc --noEmit
bun run check                  # Biome lint + format
npx vitest run                 # Run all tests
```

## Internal Distribution (TajiAI)

This package is published to [GitHub Packages](https://github.com/orgs/TajiAI/packages) as `@tajiai/robinhood-for-agents`.

### Developer setup (one-time)

1. Create a GitHub Personal Access Token (classic) at **Settings → Developer settings → Personal access tokens → Tokens (classic)** with the `read:packages` scope.

2. Configure npm to authenticate with GitHub Packages:
   ```bash
   npm config set //npm.pkg.github.com/:_authToken ghp_YOUR_TOKEN_HERE
   ```

### Add to a TajiAI service

1. Add a `.npmrc` to your project root (if not already present):
   ```
   @tajiai:registry=https://npm.pkg.github.com
   ```

2. Install with an alias so imports match the documentation:
   ```bash
   bun add robinhood-for-agents@npm:@tajiai/robinhood-for-agents@^0.7.0
   ```
   This adds `"robinhood-for-agents": "npm:@tajiai/robinhood-for-agents@^0.7.0"` to your `package.json`.

3. Import as usual:
   ```typescript
   import { getClient } from "robinhood-for-agents";
   ```

### CI setup (GitHub Actions)

For TajiAI services that depend on this package, add registry auth to your workflow:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: "22"
      registry-url: "https://npm.pkg.github.com"
      scope: "@tajiai"
  - uses: oven-sh/setup-bun@v2
  - run: bun install --frozen-lockfile
    env:
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`GITHUB_TOKEN` is automatic in GitHub Actions for repos in the same TajiAI org — no extra secrets needed. For repos outside the org, store a PAT with `read:packages` as a repository secret.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design, authentication flow, HTTP pipeline, and exception hierarchy.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to add new tools, create skills, and run tests.

## Disclaimer

This project is **not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.** "Robinhood" is a trademark of Robinhood Markets, Inc. This software interacts with Robinhood's services through publicly accessible interfaces but is an independent, third-party tool.

**USE AT YOUR OWN RISK.** This software enables AI agents to read data from and place orders on your Robinhood brokerage account. Automated and AI-assisted trading carries inherent risks, including but not limited to:

- Unintended order execution due to AI misinterpretation
- Financial losses from erroneous trades
- Stale or inaccurate market data
- Software bugs or unexpected behavior

You are solely responsible for all activity on your brokerage account, whether initiated manually or through this software. The authors and contributors assume no liability for any financial losses, damages, or other consequences arising from the use of this software. Review all AI-proposed actions before confirming, and never grant unsupervised trading authority to any automated system.

This software is provided "as is" without warranty of any kind. See [LICENSE](LICENSE) for full terms.

## License

Proprietary — TajiAI internal use only. See [LICENSE](LICENSE).
