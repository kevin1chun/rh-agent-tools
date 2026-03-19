"""URL builders for Robinhood API endpoints.

When an auth proxy is configured (via ROBINHOOD_API_PROXY env or
configure_proxy()), the mutable API_BASE and NUMMUS_BASE point at the
proxy's path-prefix routes instead of the upstream origins.
"""

import os
import re
from urllib.parse import urlparse

# Mutable — points at the proxy when one is configured.
API_BASE = "https://api.robinhood.com"
NUMMUS_BASE = "https://nummus.robinhood.com"

# The original Robinhood origins (never change).
UPSTREAM_API = "https://api.robinhood.com"
UPSTREAM_NUMMUS = "https://nummus.robinhood.com"

_proxy_url: str | None = None
_proxy_token: str | None = None

_SAFE_PATH_SEGMENT = re.compile(r"^[a-zA-Z0-9_.:@-]+$")


def configure_proxy(url: str, token: str | None = None) -> None:
    """Point all URL builders at the auth proxy."""
    global API_BASE, NUMMUS_BASE, _proxy_url, _proxy_token
    base = url.rstrip("/")
    _proxy_url = base
    _proxy_token = token
    API_BASE = f"{base}/rh"
    NUMMUS_BASE = f"{base}/nummus"


def get_proxy_url() -> str | None:
    """Return the configured proxy URL, or None if none."""
    return _proxy_url


def get_proxy_token() -> str | None:
    """Return the proxy shared secret, or None if none."""
    return _proxy_token


def trusted_origins() -> set[str]:
    """Build the set of trusted origins dynamically so it includes the proxy."""
    origins = {
        urlparse(UPSTREAM_API).scheme + "://" + urlparse(UPSTREAM_API).netloc,
        urlparse(UPSTREAM_NUMMUS).scheme + "://" + urlparse(UPSTREAM_NUMMUS).netloc,
        "https://robinhood.com",
    }
    if _proxy_url:
        parsed = urlparse(_proxy_url)
        origins.add(f"{parsed.scheme}://{parsed.netloc}")
    for base in (API_BASE, NUMMUS_BASE):
        try:
            parsed = urlparse(base)
            if parsed.netloc:
                origins.add(f"{parsed.scheme}://{parsed.netloc}")
        except Exception:
            pass
    return origins


def _safe_segment(value: str, label: str) -> str:
    """Reject path segments that could cause path traversal or injection."""
    if not _SAFE_PATH_SEGMENT.match(value):
        msg = (
            f"Invalid {label}: must contain only alphanumeric, "
            "hyphen, underscore, or dot characters"
        )
        raise ValueError(msg)
    return value


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def oauth_token() -> str:
    return f"{API_BASE}/oauth2/token/"


def oauth_revoke() -> str:
    return f"{API_BASE}/oauth2/revoke_token/"


def challenge(challenge_id: str) -> str:
    return f"{API_BASE}/challenge/{challenge_id}/respond/"


def pathfinder_user_machine() -> str:
    return f"{API_BASE}/pathfinder/user_machine/"


def pathfinder_inquiry(machine_id: str) -> str:
    return f"{API_BASE}/pathfinder/inquiries/{machine_id}/user_view/"


def push_prompt_status(challenge_id: str) -> str:
    return f"{API_BASE}/push/{challenge_id}/get_prompts_status/"


# ---------------------------------------------------------------------------
# Accounts & Profiles
# ---------------------------------------------------------------------------


def accounts() -> str:
    return f"{API_BASE}/accounts/"


def account(account_number: str) -> str:
    return f"{API_BASE}/accounts/{account_number}/"


def portfolios() -> str:
    return f"{API_BASE}/portfolios/"


def portfolio(account_number: str) -> str:
    return f"{API_BASE}/portfolios/{account_number}/"


def portfolio_historicals(account_number: str) -> str:
    return f"{API_BASE}/portfolios/historicals/{account_number}/"


def user() -> str:
    return f"{API_BASE}/user/"


def user_basic_info() -> str:
    return f"{API_BASE}/user/basic_info/"


def investment_profile() -> str:
    return f"{API_BASE}/user/investment_profile/"


def dividends() -> str:
    return f"{API_BASE}/dividends/"


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------


def positions() -> str:
    return f"{API_BASE}/positions/"


# ---------------------------------------------------------------------------
# Stocks
# ---------------------------------------------------------------------------


def quotes() -> str:
    return f"{API_BASE}/quotes/"


def quote(symbol: str) -> str:
    return f"{API_BASE}/quotes/{symbol.upper()}/"


def instruments() -> str:
    return f"{API_BASE}/instruments/"


def instrument(instrument_id: str) -> str:
    return f"{API_BASE}/instruments/{instrument_id}/"


def fundamentals() -> str:
    return f"{API_BASE}/fundamentals/"


def fundamental(symbol: str) -> str:
    return f"{API_BASE}/fundamentals/{symbol.upper()}/"


def stock_historicals() -> str:
    return f"{API_BASE}/quotes/historicals/"


def stock_historicals_for(symbol: str) -> str:
    return f"{API_BASE}/quotes/historicals/{symbol.upper()}/"


def news(symbol: str) -> str:
    return f"{API_BASE}/midlands/news/{symbol.upper()}/"


def ratings(instrument_id: str) -> str:
    return f"{API_BASE}/midlands/ratings/{instrument_id}/"


def earnings() -> str:
    return f"{API_BASE}/marketdata/earnings/"


def tags(tag: str) -> str:
    return f"{API_BASE}/midlands/tags/tag/{_safe_segment(tag, 'tag')}/"


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------


def option_chains() -> str:
    return f"{API_BASE}/options/chains/"


def option_chain(chain_id: str) -> str:
    return f"{API_BASE}/options/chains/{chain_id}/"


def option_instruments() -> str:
    return f"{API_BASE}/options/instruments/"


def option_market_data(option_id: str) -> str:
    return f"{API_BASE}/marketdata/options/{option_id}/"


def option_orders() -> str:
    return f"{API_BASE}/options/orders/"


def option_order(order_id: str) -> str:
    return f"{API_BASE}/options/orders/{order_id}/"


def option_positions() -> str:
    return f"{API_BASE}/options/positions/"


def option_aggregate_positions() -> str:
    return f"{API_BASE}/options/aggregate_positions/"


# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------


def indexes() -> str:
    return f"{API_BASE}/indexes/"


def index_values() -> str:
    return f"{API_BASE}/marketdata/indexes/values/v1/"


# ---------------------------------------------------------------------------
# Crypto
# ---------------------------------------------------------------------------


def crypto_currency_pairs() -> str:
    return f"{NUMMUS_BASE}/currency_pairs/"


def crypto_quote(pair_id: str) -> str:
    return f"{API_BASE}/marketdata/forex/quotes/{pair_id}/"


def crypto_historicals(pair_id: str) -> str:
    return f"{API_BASE}/marketdata/forex/historicals/{pair_id}/"


def crypto_holdings() -> str:
    return f"{NUMMUS_BASE}/holdings/"


def crypto_orders() -> str:
    return f"{NUMMUS_BASE}/orders/"


def crypto_order(order_id: str) -> str:
    return f"{NUMMUS_BASE}/orders/{order_id}/"


def crypto_accounts() -> str:
    return f"{NUMMUS_BASE}/accounts/"


# ---------------------------------------------------------------------------
# Stock Orders
# ---------------------------------------------------------------------------


def stock_orders() -> str:
    return f"{API_BASE}/orders/"


def stock_order(order_id: str) -> str:
    return f"{API_BASE}/orders/{order_id}/"


def cancel_stock_order(order_id: str) -> str:
    return f"{API_BASE}/orders/{order_id}/cancel/"


def cancel_option_order(order_id: str) -> str:
    return f"{API_BASE}/options/orders/{order_id}/cancel/"


def cancel_crypto_order(order_id: str) -> str:
    return f"{NUMMUS_BASE}/orders/{order_id}/cancel/"


# ---------------------------------------------------------------------------
# Markets
# ---------------------------------------------------------------------------


def markets() -> str:
    return f"{API_BASE}/markets/"


def market_hours(market: str, date: str) -> str:
    m = _safe_segment(market, "market")
    d = _safe_segment(date, "date")
    return f"{API_BASE}/markets/{m}/hours/{d}/"


def top_movers_sp500() -> str:
    return f"{API_BASE}/midlands/movers/sp500/"


def top_movers() -> str:
    return f"{API_BASE}/midlands/tags/tag/top-movers/"


def top_100() -> str:
    return f"{API_BASE}/midlands/tags/tag/100-most-popular/"


# ---------------------------------------------------------------------------
# Auto-configure from env at module load
# ---------------------------------------------------------------------------

_env_proxy = os.environ.get("ROBINHOOD_API_PROXY", "").strip().rstrip("/")
if _env_proxy:
    _env_token = os.environ.get("ROBINHOOD_PROXY_TOKEN", "").strip() or None
    if not _env_token:
        from ._token_store import load_proxy_token

        _env_token = load_proxy_token()
    configure_proxy(_env_proxy, _env_token)
