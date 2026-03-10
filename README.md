# rh-agent-tools

[![CI](https://github.com/kevin1chun/rh-agent-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/rh-agent-tools/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/rh-agent-tools)](https://www.npmjs.com/package/rh-agent-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

AI-native Robinhood trading interface — TypeScript monorepo with a standalone API client and MCP server.

Two packages:
- **`@rh-agent-tools/client`** — Standalone Robinhood API client (~50 async methods)
- **`rh-agent-tools`** — MCP server with 18 structured tools for any MCP-compatible AI agent

Compatible with **Claude Code**, **Codex**, **OpenClaw**, and any MCP-compatible agent.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Google Chrome
- A Robinhood account

## Quick Start (local install)

```bash
git clone https://github.com/kevin1chun/rh-agent-tools.git
cd rh-agent-tools
bun install
```

### 1. Install MCP server + skills

```bash
bun packages/server/bin/rh-agent-tools.ts install
```

This does two things:
- Adds the MCP server to `~/.claude/settings.json` (global — available in all projects)
- Copies 5 skills to `.claude/skills/` in the current directory

Restart Claude Code to pick up the changes.

You can also install them separately:

```bash
bun packages/server/bin/rh-agent-tools.ts install --mcp     # MCP server config only
bun packages/server/bin/rh-agent-tools.ts install --skills   # Skills only
```

<details>
<summary>Manual setup (Claude Desktop or other MCP clients)</summary>

Add to your MCP client's config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "rh-agent-tools": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/rh-agent-tools/packages/server/bin/rh-agent-tools.ts"]
    }
  }
}
```
</details>

### 2. Authenticate

Start Claude Code and say "setup robinhood" (or call `robinhood_browser_login` directly). Chrome will open to the real Robinhood login page — log in with your credentials and MFA. The session is cached and auto-restores for ~24 hours.

## Quick Start (npm — IN PROGRESS)

Once published to npm, the setup simplifies to:

```bash
npm install -g rh-agent-tools

# Install MCP server config + skills (same as local, but no bun prefix needed)
cd your-project
rh-agent-tools install
```

## Client Library (standalone)

```typescript
import { RobinhoodClient } from "@rh-agent-tools/client";

const client = new RobinhoodClient();
await client.restoreSession();

const quotes = await client.getQuotes("AAPL");
const portfolio = await client.buildHoldings();
```

## MCP Tools (18)

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

## Claude Code Skills (5)

Install skills into any project (see [Quick Start](#quick-start-local-install) for full setup).

| Skill | Triggers |
|-------|----------|
| `robinhood-setup` | "setup robinhood", "connect to robinhood" |
| `robinhood-portfolio` | "show my portfolio", "my holdings" |
| `robinhood-research` | "research AAPL", "analyze TSLA" |
| `robinhood-trade` | "buy 10 AAPL", "sell my position" |
| `robinhood-options` | "show AAPL options", "find calls" |

Each skill includes a `client-api.md` reference for advanced users who want Claude to generate TypeScript scripts using `@rh-agent-tools/client`.

## Safety

- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- All order placements require explicit parameters (no dangerous defaults)
- Skills always confirm with the user before placing orders
- See [ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk matrix

## Authentication

Sessions are cached to `~/.rh-agent-tools/session.enc` (AES-256-GCM encrypted, key in OS keychain). Authentication uses browser-based login — `robinhood_browser_login` opens Chrome to the real Robinhood login page where you handle MFA natively. After initial login, subsequent authentication is automatic until the token expires (~24 hours).

**MCP**: Call `robinhood_browser_login` to open Chrome and log in. After that, all tools auto-restore the cached session.

**Skills**: Run the `robinhood-setup` skill for guided browser login.

## Development

```bash
bun install                    # Install deps
bun run typecheck              # tsc --noEmit
bun run check                  # Biome lint + format
npx vitest run                 # Run all tests (120 tests)
```

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

MIT — see [LICENSE](LICENSE).
