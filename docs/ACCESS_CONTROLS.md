# Access Controls

## Risk Levels

### Low Risk (Read Operations)
All data retrieval operations. No financial impact.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Portfolio/Holdings | `robinhood_get_portfolio` | `robinhood-portfolio` |
| Account/Profile | `robinhood_get_account` | - |
| Stock Quotes/Data | `robinhood_get_stock_quote` | `robinhood-research` |
| Historical Data | `robinhood_get_historicals` | `robinhood-research` |
| News/Ratings | `robinhood_get_news` | `robinhood-research` |
| Options Data | `robinhood_get_options` | `robinhood-options` |
| Crypto Data | `robinhood_get_crypto` | - |
| Market Movers | `robinhood_get_movers` | - |
| Search | `robinhood_search` | - |
| Order History | `robinhood_get_orders` | - |
| Order Status | `robinhood_get_order_status` | - |
| Session Check | `robinhood_check_session` | - |
| Dividends/Documents | - | via code |
| Watchlists | - | via code |

### Medium Risk
Operations with limited financial impact or credential exposure.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Authentication | `robinhood_browser_login` | `robinhood-setup` |
| Cancel Single Order | `robinhood_cancel_order` | `robinhood-trade` |

### High Risk (Write Operations)
Order placement. Requires explicit parameters — no dangerous defaults.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Stock Orders | `robinhood_place_stock_order` | `robinhood-trade` |
| Option Orders | `robinhood_place_option_order` | `robinhood-trade` |
| Crypto Orders | `robinhood_place_crypto_order` | `robinhood-trade` |

### Blocked (Critical Risk)
These operations are **never exposed** through MCP tools or skills.

| Operation | Rationale |
|-----------|-----------|
| Fund Transfers (`withdrawl_funds_to_bank_account`) | Irreversible financial impact |
| Deposits (`deposit_funds_to_robinhood_account`) | Irreversible financial impact |
| Bank Unlinking | Could lock user out of transfers |
| Bulk Cancel (`cancel_all_stock_orders`, etc.) | Too destructive without per-order review |

## Safety Measures

### MCP Tools
- Order tools require all parameters explicitly (symbol, side, quantity, type)
- No default values that could cause accidental trades
- Blocked operations return error messages explaining why

### Skills
- Trade skill always shows order preview and waits for user confirmation
- Scripts display current price and estimated cost before proceeding
- Blocked operations are documented as "never use" in reference files

### General
- Session tokens expire after ~24 hours
- Browser-based login only — no credentials pass through the tool layer
- Session tokens stored in OS keychain via `Bun.secrets` (macOS Keychain Services) — no plaintext fallback
- See [SECURITY.md](./SECURITY.md) for the full threat model and deployment tiers
