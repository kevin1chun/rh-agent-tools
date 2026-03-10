# rh-for-agents

[![CI](https://github.com/kevin1chun/rh-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/rh-for-agents/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/rh-for-agents)](https://www.npmjs.com/package/rh-for-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Robinhood for AI agents — an MCP server with 18 structured tools and a standalone TypeScript client, in a single package.

- **18 MCP tools** for any MCP-compatible AI agent
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
npx rh-for-agents onboard
```

The interactive setup detects your agent, registers the MCP server, installs skills (where supported), and walks you through Robinhood login.

You can also specify your agent directly:

```bash
rh-for-agents onboard --agent claude-code
rh-for-agents onboard --agent codex
rh-for-agents onboard --agent openclaw
```

### From source

```bash
git clone https://github.com/kevin1chun/rh-for-agents.git
cd rh-for-agents
bun install
bun bin/rh-for-agents.ts onboard
```

### Manual setup

<details>
<summary>Claude Code</summary>

```bash
# Register MCP server (global — available in all projects)
claude mcp add -s user rh-for-agents -- bun run /path/to/bin/rh-for-agents.ts

# Install skills (per-project, optional)
cd your-project
rh-for-agents install --skills
```

Restart Claude Code to pick up the changes. Claude Code supports 5 trading skills in addition to the 18 MCP tools — see [Skills](#skills-5).
</details>

<details>
<summary>Codex</summary>

```bash
codex mcp add rh-for-agents -- bun run /path/to/bin/rh-for-agents.ts
```

Restart Codex to pick up the changes. Codex uses all 18 MCP tools directly.
</details>

<details>
<summary>OpenClaw (skills only)</summary>

```bash
rh-for-agents onboard --agent openclaw
```

This installs 5 trading skills to `~/.openclaw/workspace/skills/`. Restart the OpenClaw gateway to pick up the changes.

</details>

<details>
<summary>Other MCP clients (Claude Desktop, etc.)</summary>

Add to your MCP client's config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "rh-for-agents": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/rh-for-agents/bin/rh-for-agents.ts"]
    }
  }
}
```
</details>

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

## Skills (5)

Skills provide guided workflows on top of MCP tools. Supported by **Claude Code** and **OpenClaw**. Agents without skill support (Codex, etc.) use the 18 MCP tools directly, which provide the same functionality.

| Skill | Triggers |
|-------|----------|
| `robinhood-setup` | "setup robinhood", "connect to robinhood" |
| `robinhood-portfolio` | "show my portfolio", "my holdings" |
| `robinhood-research` | "research AAPL", "analyze TSLA" |
| `robinhood-trade` | "buy 10 AAPL", "sell my position" |
| `robinhood-options` | "show AAPL options", "find calls" |

Each skill includes a `client-api.md` reference for advanced users who want their agent to generate TypeScript scripts using `rh-for-agents`.

## Agent Compatibility

| Feature | Claude Code | Codex | OpenClaw | Other MCP |
|---------|:-----------:|:-----:|:--------:|:---------:|
| 18 MCP tools | Yes | Yes | Yes | Yes |
| 5 trading skills | Yes | — | Yes | — |
| `onboard` setup | Yes | Yes | Yes | — |
| Browser auth | Yes | Yes | Yes | Yes |

## Client Library (standalone)

```typescript
import { RobinhoodClient } from "rh-for-agents";

const client = new RobinhoodClient();
await client.restoreSession();

const quotes = await client.getQuotes("AAPL");
const portfolio = await client.buildHoldings();
```

## Safety

- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- All order placements require explicit parameters (no dangerous defaults)
- Skills always confirm with the user before placing orders
- See [ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk matrix

## Authentication

Sessions are cached to `~/.rh-for-agents/session.enc` (AES-256-GCM encrypted, key in OS keychain). Authentication uses browser-based login — `robinhood_browser_login` opens Chrome to the real Robinhood login page where you handle MFA natively. After initial login, subsequent authentication is automatic until the token expires (~24 hours).

**MCP**: Call `robinhood_browser_login` to open Chrome and log in (works with all agents). After that, all tools auto-restore the cached session.

**Skills**: Run the `robinhood-setup` skill for guided browser login (Claude Code and OpenClaw).

## Development

```bash
bun install                    # Install deps
bun run typecheck              # tsc --noEmit
bun run check                  # Biome lint + format
npx vitest run                 # Run all tests
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
