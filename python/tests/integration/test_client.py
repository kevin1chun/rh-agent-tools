"""Integration tests — hit the real Robinhood API via the auth proxy.

Prerequisites:
    1. Login: robinhood-for-agents login
    2. Proxy: robinhood-for-agents proxy

Run: uv run pytest -m integration
"""

from collections.abc import AsyncGenerator

import pytest

from robinhood_agents import RobinhoodClient

pytestmark = pytest.mark.integration


@pytest.fixture
async def client() -> AsyncGenerator[RobinhoodClient, None]:
    async with RobinhoodClient() as c:
        await c.restore_session()
        yield c


async def test_authenticates(client: RobinhoodClient) -> None:
    assert client.is_logged_in


async def test_get_accounts(client: RobinhoodClient) -> None:
    accounts = await client.get_accounts()
    assert len(accounts) > 0
    assert accounts[0].account_number


async def test_get_portfolio_profile(client: RobinhoodClient) -> None:
    portfolio = await client.get_portfolio_profile()
    assert portfolio.equity is not None


async def test_get_user_profile(client: RobinhoodClient) -> None:
    user = await client.get_user_profile()
    assert user.username


async def test_get_quotes(client: RobinhoodClient) -> None:
    quotes = await client.get_quotes("AAPL")
    assert len(quotes) == 1
    assert quotes[0].last_trade_price is not None


async def test_get_fundamentals(client: RobinhoodClient) -> None:
    fundamentals = await client.get_fundamentals(["AAPL"])
    assert len(fundamentals) > 0
    assert fundamentals[0].market_cap is not None


async def test_get_stock_historicals(client: RobinhoodClient) -> None:
    historicals = await client.get_stock_historicals("AAPL", interval="day", span="week")
    assert len(historicals) > 0
    assert len(historicals[0].historicals) > 0


async def test_get_news(client: RobinhoodClient) -> None:
    news = await client.get_news("AAPL")
    assert len(news) > 0
    assert news[0].title


async def test_find_instruments(client: RobinhoodClient) -> None:
    instruments = await client.find_instruments("AAPL")
    assert len(instruments) > 0
    assert instruments[0].symbol == "AAPL"


async def test_get_positions(client: RobinhoodClient) -> None:
    positions = await client.get_positions()
    assert isinstance(positions, list)


async def test_get_latest_price(client: RobinhoodClient) -> None:
    prices = await client.get_latest_price(["AAPL", "MSFT"])
    assert len(prices) == 2
    for price in prices:
        assert float(price) > 0
