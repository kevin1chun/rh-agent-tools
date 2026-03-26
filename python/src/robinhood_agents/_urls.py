"""URL builders for Robinhood API endpoints.

API_BASE and NUMMUS_BASE are constants — the client talks directly
to Robinhood with Bearer auth injected by the session layer.
"""

import re

API_BASE = "https://api.robinhood.com"
NUMMUS_BASE = "https://nummus.robinhood.com"

_SAFE_PATH_SEGMENT = re.compile(r"^[a-zA-Z0-9_.:@-]+$")


def trusted_origins() -> frozenset[str]:
    """Trusted Robinhood origins for redirect safety."""
    return frozenset(
        {
            "https://api.robinhood.com",
            "https://nummus.robinhood.com",
            "https://robinhood.com",
        }
    )


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
    return f"{API_BASE}/challenge/{_safe_segment(challenge_id, 'challenge_id')}/respond/"


def pathfinder_user_machine() -> str:
    return f"{API_BASE}/pathfinder/user_machine/"


def pathfinder_inquiry(machine_id: str) -> str:
    return f"{API_BASE}/pathfinder/inquiries/{_safe_segment(machine_id, 'machine_id')}/user_view/"


def push_prompt_status(challenge_id: str) -> str:
    return f"{API_BASE}/push/{_safe_segment(challenge_id, 'challenge_id')}/get_prompts_status/"


# ---------------------------------------------------------------------------
# Accounts & Profiles
# ---------------------------------------------------------------------------


def accounts() -> str:
    return f"{API_BASE}/accounts/"


def account(account_number: str) -> str:
    return f"{API_BASE}/accounts/{_safe_segment(account_number, 'account_number')}/"


def portfolios() -> str:
    return f"{API_BASE}/portfolios/"


def portfolio(account_number: str) -> str:
    return f"{API_BASE}/portfolios/{_safe_segment(account_number, 'account_number')}/"


def portfolio_historicals(account_number: str) -> str:
    return f"{API_BASE}/portfolios/historicals/{_safe_segment(account_number, 'account_number')}/"


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
    return f"{API_BASE}/quotes/{_safe_segment(symbol.upper(), 'symbol')}/"


def instruments() -> str:
    return f"{API_BASE}/instruments/"


def instrument(instrument_id: str) -> str:
    return f"{API_BASE}/instruments/{_safe_segment(instrument_id, 'instrument_id')}/"


def fundamentals() -> str:
    return f"{API_BASE}/fundamentals/"


def fundamental(symbol: str) -> str:
    return f"{API_BASE}/fundamentals/{_safe_segment(symbol.upper(), 'symbol')}/"


def stock_historicals() -> str:
    return f"{API_BASE}/quotes/historicals/"


def stock_historicals_for(symbol: str) -> str:
    return f"{API_BASE}/quotes/historicals/{_safe_segment(symbol.upper(), 'symbol')}/"


def news(symbol: str) -> str:
    return f"{API_BASE}/midlands/news/{_safe_segment(symbol.upper(), 'symbol')}/"


def ratings(instrument_id: str) -> str:
    return f"{API_BASE}/midlands/ratings/{_safe_segment(instrument_id, 'instrument_id')}/"


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
    return f"{API_BASE}/options/chains/{_safe_segment(chain_id, 'chain_id')}/"


def option_instruments() -> str:
    return f"{API_BASE}/options/instruments/"


def option_market_data(option_id: str) -> str:
    return f"{API_BASE}/marketdata/options/{_safe_segment(option_id, 'option_id')}/"


def option_orders() -> str:
    return f"{API_BASE}/options/orders/"


def option_order(order_id: str) -> str:
    return f"{API_BASE}/options/orders/{_safe_segment(order_id, 'order_id')}/"


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
    return f"{API_BASE}/marketdata/forex/quotes/{_safe_segment(pair_id, 'pair_id')}/"


def crypto_historicals(pair_id: str) -> str:
    return f"{API_BASE}/marketdata/forex/historicals/{_safe_segment(pair_id, 'pair_id')}/"


def crypto_holdings() -> str:
    return f"{NUMMUS_BASE}/holdings/"


def crypto_orders() -> str:
    return f"{NUMMUS_BASE}/orders/"


def crypto_order(order_id: str) -> str:
    return f"{NUMMUS_BASE}/orders/{_safe_segment(order_id, 'order_id')}/"


def crypto_accounts() -> str:
    return f"{NUMMUS_BASE}/accounts/"


# ---------------------------------------------------------------------------
# Stock Orders
# ---------------------------------------------------------------------------


def stock_orders() -> str:
    return f"{API_BASE}/orders/"


def stock_order(order_id: str) -> str:
    return f"{API_BASE}/orders/{_safe_segment(order_id, 'order_id')}/"


def cancel_stock_order(order_id: str) -> str:
    return f"{API_BASE}/orders/{_safe_segment(order_id, 'order_id')}/cancel/"


def cancel_option_order(order_id: str) -> str:
    return f"{API_BASE}/options/orders/{_safe_segment(order_id, 'order_id')}/cancel/"


def cancel_crypto_order(order_id: str) -> str:
    return f"{NUMMUS_BASE}/orders/{_safe_segment(order_id, 'order_id')}/cancel/"


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
