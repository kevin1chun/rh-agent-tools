# robinhood-for-agents

[![CI](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/robinhood-for-agents)](https://www.npmjs.com/package/robinhood-for-agents)
[![ClawHub](https://img.shields.io/badge/ClawHub-robinhood--for--agents-blue)](https://clawhub.ai/kevin1chun/robinhood-for-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

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

The interactive setup detects your agent, registers the MCP server, installs skills (where supported), walks you through Robinhood login, and configures the auth proxy. It handles both local and Docker deployments — just pick "This machine" or "Docker / remote" when prompted.

You can also specify your agent directly:

```bash
robinhood-for-agents onboard --agent claude-code
robinhood-for-agents onboard --agent codex
robinhood-for-agents onboard --agent openclaw
```

### From source

```bash
git clone https://github.com/kevin1chun/robinhood-for-agents.git
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

## Docker Deployment

When deploying an agent in Docker (OpenClaw, custom agents, etc.), the container cannot access the host OS keychain. An **auth proxy** on the host bridges this gap — it holds tokens in the keychain and injects auth headers into requests from the container. No tokens, keys, or credentials enter the container.

```
┌─── Host ──────────────────────┐    ┌─── Container ──────────────┐
│                               │    │                            │
│ Keychain: has tokens          │    │ Keychain: empty            │
│ Proxy: listens on :3100      │◄───│ Client: talks to proxy     │
│                               │    │                            │
│ Proxy receives request        │    │ No tokens on filesystem    │
│ → validates proxy token       │    │ No RH tokens in env vars   │
│ → injects Bearer header       │    │                            │
│ → forwards to Robinhood API   │    │                            │
│ → returns response            │    │                            │
└───────────────────────────────┘    └────────────────────────────┘
```

### Setup

The guided setup handles Docker — just pick "Docker / remote" when prompted:

```bash
npx robinhood-for-agents onboard
```

It will log you in, generate a proxy token, print copy-paste commands for your container, and optionally start the proxy.

<details>
<summary>Manual setup (without onboard)</summary>

```bash
# 1. Login on the host (opens Chrome for Robinhood login)
npx robinhood-for-agents onboard   # or: bun bin/robinhood-for-agents.ts onboard

# 2. Start the auth proxy with a known token
export ROBINHOOD_PROXY_TOKEN="$(uuidgen)"
npx robinhood-for-agents proxy --port 3100

# 3. Verify
curl http://localhost:3100/health   # {"status":"ok"}
```

```yaml
# 4. docker-compose.yml
services:
  agent:
    image: your-agent-image
    environment:
      ROBINHOOD_API_PROXY: "http://host.docker.internal:3100"
      ROBINHOOD_PROXY_TOKEN: "${ROBINHOOD_PROXY_TOKEN}"
```
</details>

> **Linux hosts**: Add `extra_hosts: ["host.docker.internal:host-gateway"]` to your Compose service.

Kill the proxy on the host to instantly revoke all container access. See [docs/DOCKER.md](docs/DOCKER.md) for the full guide and [docs/SECURITY.md](docs/SECURITY.md) for the threat model.

## Safety

- **Tokens are never exposed to the AI agent** — all API calls route through an auth proxy that injects Bearer tokens. The agent only sees tool results, never access tokens or credentials.
- **Docker isolation** — tokens stay in the host keychain. Containers only get a proxy URL. See [SECURITY.md](docs/SECURITY.md) for attack scenarios.
- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- All order placements require explicit parameters (no dangerous defaults)
- Skills always confirm with the user before placing orders
- See [ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk matrix

## Authentication

All API requests route through a local **auth proxy** that injects Bearer tokens from the OS keychain. The client never handles tokens directly.

**Login**: Call `robinhood_browser_login` (MCP) or say "setup robinhood" (skills) to open Chrome. Log in normally with your credentials and MFA. Playwright passively intercepts the OAuth token response — it never clicks buttons or fills forms. Tokens are stored in the OS keychain via `Bun.secrets` (no files on disk).

**Token storage**: OS keychain only (macOS Keychain Services, Linux libsecret). No plaintext fallback. Two keychain entries: `session-tokens` (RH OAuth) and `proxy-token` (proxy access control shared secret). The proxy is the only component that reads RH tokens from the keychain — the client and agent never touch them directly.

### How the auth proxy starts

The proxy is a lightweight HTTP server on `127.0.0.1:3100` that reads tokens from the keychain and injects `Authorization: Bearer` headers into every request forwarded to Robinhood. It also handles token refresh on 401 automatically.

When `restoreSession()` is called, it runs `ensureProxy()` which:

1. Checks if something is already listening on `:3100` (reuses it if so)
2. If not, starts the proxy **in-process** via `Bun.serve()`

This means:

| Context | What happens | Proxy lifetime |
|---------|-------------|----------------|
| **MCP server** | Proxy starts once at boot, shared by all tool calls | Lives for the MCP session |
| **Standalone script** (`bun -e`) | Proxy starts on first `restoreSession()`, reused for all calls | Dies when the script exits |
| **Multiple processes** | Second process discovers the proxy on `:3100`, reads proxy token from OS keychain | Shared across processes |

For **short-lived scripts** (skills, one-off commands), each invocation starts and stops the proxy with the process. This adds ~50ms of overhead per invocation. If you're running many short scripts and want to avoid this, start a persistent proxy in the background:

```bash
# Start a long-lived proxy (stays running until you kill it)
npx robinhood-for-agents proxy &

# Now any script will discover it on :3100 and reuse it
bun -e "
  import { getClient } from 'robinhood-for-agents';
  const rh = getClient();
  await rh.restoreSession();   // finds existing proxy, no startup cost
  console.log(await rh.getQuotes('AAPL'));
"
```

This is the same proxy used for [Docker deployment](#docker-deployment) — the only difference is whether it's started in-process (automatic) or as a standalone background process (explicit).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full auth flow diagram and [docs/SECURITY.md](docs/SECURITY.md) for the threat model.

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
