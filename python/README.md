# robinhood-for-agents (Python)

Async Python client for the Robinhood trading API. Designed for AI agents.

## Installation

```bash
pip install robinhood-for-agents
# or
uv add robinhood-for-agents
```

Requires Python 3.12+.

## Quick Start

```python
from robinhood_agents import RobinhoodClient

async with RobinhoodClient() as client:
    await client.restore_session()

    # Get quotes
    quotes = await client.get_quotes("AAPL")
    print(quotes[0].last_trade_price)

    # Get portfolio
    portfolio = await client.get_portfolio_profile()
    print(portfolio.equity)

    # Place a stock order
    order = await client.order_stock("AAPL", "buy", 1, limit_price=150.0)
```

## Authentication

The Python SDK connects to the auth proxy (shared with the TypeScript SDK).
The proxy holds tokens, injects auth headers, and handles token refresh.

### Local setup

1. **Login** (one-time, via TypeScript CLI):
   ```bash
   robinhood-for-agents onboard
   ```

2. **Start the proxy:**
   ```bash
   robinhood-for-agents proxy
   ```

3. **Use from Python** — auto-discovers the proxy at `127.0.0.1:3100`:
   ```python
   async with RobinhoodClient() as client:
       await client.restore_session()
       quotes = await client.get_quotes("AAPL")
   ```

### Docker / remote

Set `ROBINHOOD_API_PROXY` to skip auto-discovery:

```bash
export ROBINHOOD_API_PROXY=http://host.docker.internal:3100
export ROBINHOOD_PROXY_TOKEN=<your-token>
```

See [Docker docs](../docs/DOCKER.md) for full setup.

## API Reference

All methods are `async`. Call `restore_session()` before any data method.

### Accounts
- `get_accounts()` / `get_account_profile()` / `get_portfolio_profile()`
- `get_user_profile()` / `get_investment_profile()`

### Market Data
- `get_quotes(symbols)` / `get_latest_price(symbols)`
- `get_fundamentals(symbols)` / `get_stock_historicals(symbols)`
- `get_news(symbol)` / `get_ratings(symbol)` / `get_earnings(symbol)`

### Orders
- `order_stock(symbol, side, quantity)` / `cancel_stock_order(order_id)`
- `order_option(symbol, legs, price, quantity, direction)` / `cancel_option_order(order_id)`
- `order_crypto(symbol, side, amount)` / `cancel_crypto_order(order_id)`

### Options
- `get_chains(symbol)` / `find_tradable_options(symbol)`
- `get_option_market_data(symbol, expiration, strike, type)`

### Crypto
- `get_crypto_quote(symbol)` / `get_crypto_historicals(symbol)`
- `get_crypto_positions()`

See the [TypeScript SDK docs](../docs/) for full API details — the Python SDK mirrors the same methods.
