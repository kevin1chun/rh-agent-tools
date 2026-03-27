"""Tests for RobinhoodClient."""

import json

import pytest
import respx
from httpx import Response

from robinhood_agents import NotFoundError, NotLoggedInError, RobinhoodClient
from robinhood_agents._urls import API_BASE


class TestClientAuth:
    def test_not_logged_in_by_default(self, client: RobinhoodClient) -> None:
        assert client.is_logged_in is False

    async def test_requires_auth(self, client: RobinhoodClient) -> None:
        with pytest.raises(NotLoggedInError):
            await client.get_accounts()

    async def test_context_manager(self) -> None:
        async with RobinhoodClient() as client:
            assert client.is_logged_in is False

    def test_direct_access_token_marks_logged_in(self) -> None:
        client = RobinhoodClient(access_token="test-token")
        assert client.is_logged_in is True


class TestSingletonClient:
    def test_get_client_returns_same_instance(self) -> None:
        import robinhood_agents
        from robinhood_agents import get_client

        # Reset singleton
        robinhood_agents._default_client = None
        c1 = get_client()
        c2 = get_client()
        assert c1 is c2
        robinhood_agents._default_client = None  # cleanup

    async def test_close_client_resets_singleton(self) -> None:
        import robinhood_agents
        from robinhood_agents import close_client, get_client

        robinhood_agents._default_client = None
        get_client()
        assert robinhood_agents._default_client is not None
        await close_client()
        assert robinhood_agents._default_client is None


def _make_logged_in_client() -> RobinhoodClient:
    """Create a client that's marked as logged in for testing."""
    return RobinhoodClient(access_token="test-token")


def _mock_instrument_lookup() -> None:
    """Mock the instrument search + accounts endpoints used by order_stock."""
    respx.get(f"{API_BASE}/instruments/").mock(
        return_value=Response(
            200,
            json={
                "results": [
                    {
                        "url": f"{API_BASE}/instruments/abc123/",
                        "id": "abc123",
                        "symbol": "AAPL",
                        "name": "Apple Inc",
                        "type": "stock",
                    }
                ]
            },
        )
    )
    respx.get(f"{API_BASE}/accounts/").mock(
        return_value=Response(
            200,
            json={
                "results": [
                    {
                        "url": f"{API_BASE}/accounts/ACCT1/",
                        "account_number": "ACCT1",
                        "type": "individual",
                    }
                ]
            },
        )
    )


def _mock_order_response(order_id: str = "order1", **overrides: object) -> respx.Route:
    """Mock the POST /orders/ endpoint with a stock order response."""
    data = {
        "id": order_id,
        "url": f"{API_BASE}/orders/{order_id}/",
        "state": "queued",
        "side": "buy",
        "quantity": "1.00000000",
        "type": "market",
        "trigger": "immediate",
        "time_in_force": "gfd",
        **overrides,
    }
    return respx.post(f"{API_BASE}/orders/").mock(return_value=Response(200, json=data))


class TestOrderStockValidation:
    """Test order_stock input validation (no HTTP calls for validation errors)."""

    @respx.mock
    async def test_rejects_trail_with_limit(self) -> None:
        client = _make_logged_in_client()
        with pytest.raises(ValueError, match="Cannot combine"):
            await client.order_stock("AAPL", "buy", 1.0, trail_amount=5.0, limit_price=150.0)

    @respx.mock
    async def test_rejects_trail_with_stop(self) -> None:
        client = _make_logged_in_client()
        with pytest.raises(ValueError, match="Cannot combine"):
            await client.order_stock("AAPL", "buy", 1.0, trail_amount=5.0, stop_price=140.0)

    @respx.mock
    async def test_rejects_fractional_limit(self) -> None:
        client = _make_logged_in_client()
        with pytest.raises(ValueError, match="Fractional orders"):
            await client.order_stock("AAPL", "buy", 0.5, limit_price=150.0)

    @respx.mock
    async def test_rejects_fractional_stop(self) -> None:
        client = _make_logged_in_client()
        with pytest.raises(ValueError, match="Fractional orders"):
            await client.order_stock("AAPL", "buy", 0.5, stop_price=140.0)

    @respx.mock
    async def test_rejects_fractional_trailing(self) -> None:
        client = _make_logged_in_client()
        with pytest.raises(ValueError, match="Fractional orders"):
            await client.order_stock("AAPL", "buy", 0.5, trail_amount=5.0)

    @respx.mock
    async def test_instrument_not_found_raises(self) -> None:
        client = _make_logged_in_client()
        respx.get(f"{API_BASE}/instruments/").mock(return_value=Response(200, json={"results": []}))
        with pytest.raises(NotFoundError, match="Instrument not found"):
            await client.order_stock("XYZNOTREAL", "buy", 1.0)


class TestOrderStockPayload:
    """Test that order_stock builds the correct payload for different order types."""

    @respx.mock
    async def test_market_buy_payload(self) -> None:
        _mock_instrument_lookup()
        route = _mock_order_response()
        client = _make_logged_in_client()

        await client.order_stock("AAPL", "buy", 1.0)

        assert route.called
        body = json.loads(route.calls.last.request.content)
        assert body["type"] == "market"
        assert body["trigger"] == "immediate"
        assert body["time_in_force"] == "gfd"
        assert body["side"] == "buy"
        assert body["preset_percent_limit"] == "0.05"  # market buy collar

    @respx.mock
    async def test_limit_order_payload(self) -> None:
        _mock_instrument_lookup()
        route = _mock_order_response(type="limit", time_in_force="gtc", price="150.00")
        client = _make_logged_in_client()

        await client.order_stock("AAPL", "buy", 1.0, limit_price=150.0, time_in_force="gtc")

        body = json.loads(route.calls.last.request.content)
        assert body["type"] == "limit"
        assert body["trigger"] == "immediate"
        assert body["price"] == "150.0"
        assert "preset_percent_limit" not in body  # no collar on limit orders

    @respx.mock
    async def test_stop_loss_order_payload(self) -> None:
        _mock_instrument_lookup()
        route = _mock_order_response(side="sell", trigger="stop", stop_price="140.00")
        client = _make_logged_in_client()

        await client.order_stock("AAPL", "sell", 1.0, stop_price=140.0)

        body = json.loads(route.calls.last.request.content)
        assert body["type"] == "market"
        assert body["trigger"] == "stop"
        assert body["stop_price"] == "140.0"

    @respx.mock
    async def test_trailing_stop_percentage_payload(self) -> None:
        _mock_instrument_lookup()
        route = _mock_order_response(side="sell", trigger="stop")
        client = _make_logged_in_client()

        await client.order_stock("AAPL", "sell", 1.0, trail_amount=5.0)

        body = json.loads(route.calls.last.request.content)
        peg = body["trailing_peg"]
        assert peg["type"] == "percentage"
        assert peg["percentage"] == "5.0"
        assert "price" not in peg  # no None values

    @respx.mock
    async def test_trailing_stop_amount_payload(self) -> None:
        _mock_instrument_lookup()
        route = _mock_order_response(side="sell", trigger="stop")
        client = _make_logged_in_client()

        await client.order_stock("AAPL", "sell", 1.0, trail_amount=2.0, trail_type="amount")

        body = json.loads(route.calls.last.request.content)
        peg = body["trailing_peg"]
        assert peg["type"] == "amount"
        assert peg["price"] == {"amount": "2.0"}
        assert "percentage" not in peg  # no None values

    @respx.mock
    async def test_fractional_forces_gfd(self) -> None:
        _mock_instrument_lookup()
        route = _mock_order_response(quantity="0.50000000")
        client = _make_logged_in_client()

        await client.order_stock("AAPL", "buy", 0.5, time_in_force="gtc")

        body = json.loads(route.calls.last.request.content)
        assert body["time_in_force"] == "gfd"  # forced to gfd for fractional


class TestOptionOrderValidation:
    @respx.mock
    async def test_rejects_empty_legs(self) -> None:
        client = _make_logged_in_client()
        with pytest.raises(ValueError, match="At least one leg"):
            await client.order_option(
                "AAPL", [], price=1.0, quantity=1, direction="debit", time_in_force="gfd"
            )


class TestBuildHoldings:
    @respx.mock
    async def test_empty_positions(self) -> None:
        client = _make_logged_in_client()
        respx.get(f"{API_BASE}/positions/").mock(
            return_value=Response(200, json={"results": [], "next": None})
        )
        holdings = await client.build_holdings()
        assert holdings == {}

    @respx.mock
    async def test_builds_holdings_correctly(self) -> None:
        client = _make_logged_in_client()
        # Mock positions
        respx.get(f"{API_BASE}/positions/").mock(
            return_value=Response(
                200,
                json={
                    "results": [
                        {
                            "instrument": f"{API_BASE}/instruments/abc123/",
                            "quantity": "10.00000000",
                            "average_buy_price": "150.00000000",
                        }
                    ],
                    "next": None,
                },
            )
        )
        # Mock instrument fetch
        respx.get(f"{API_BASE}/instruments/abc123/").mock(
            return_value=Response(
                200,
                json={
                    "url": f"{API_BASE}/instruments/abc123/",
                    "id": "abc123",
                    "symbol": "AAPL",
                    "simple_name": "Apple",
                    "name": "Apple Inc",
                    "type": "stock",
                },
            )
        )
        # Mock quotes
        respx.get(f"{API_BASE}/quotes/").mock(
            return_value=Response(
                200,
                json={
                    "results": [
                        {
                            "symbol": "AAPL",
                            "last_trade_price": "175.00",
                            "ask_price": "175.10",
                            "bid_price": "174.90",
                        }
                    ]
                },
            )
        )

        holdings = await client.build_holdings()
        assert "AAPL" in holdings
        h = holdings["AAPL"]
        assert h.symbol == "AAPL"
        assert h.name == "Apple"
        assert h.quantity == "10.0"
        assert h.average_buy_price == "150.0"
        assert h.price == "175.0"
        # equity = 10 * 175 = 1750
        assert float(h.equity) == 1750.0
        # equity_change = 1750 - 10*150 = 250
        assert float(h.equity_change) == 250.0
        # percent_change = (175-150)/150 * 100 ≈ 16.67
        assert abs(float(h.percent_change) - 16.6667) < 0.01


class TestCryptoQuote:
    @respx.mock
    async def test_raises_not_found_for_missing_pair(self) -> None:
        client = _make_logged_in_client()
        respx.get("https://nummus.robinhood.com/currency_pairs/").mock(
            return_value=Response(200, json={"results": []})
        )
        with pytest.raises(NotFoundError, match="Crypto pair not found"):
            await client.get_crypto_quote("XYZFAKE")


class TestNormalizeSymbols:
    @respx.mock
    async def test_comma_separated_string(self) -> None:
        client = _make_logged_in_client()
        respx.get(f"{API_BASE}/quotes/").mock(
            return_value=Response(
                200,
                json={
                    "results": [
                        {
                            "symbol": "AAPL",
                            "last_trade_price": "175.00",
                            "ask_price": "175.10",
                            "bid_price": "174.90",
                        },
                        {
                            "symbol": "MSFT",
                            "last_trade_price": "400.00",
                            "ask_price": "400.10",
                            "bid_price": "399.90",
                        },
                    ]
                },
            )
        )
        quotes = await client.get_quotes("aapl, msft")
        assert len(quotes) == 2
        # Verify request had uppercased, trimmed symbols
        request = respx.calls.last.request
        assert "AAPL" in str(request.url)
        assert "MSFT" in str(request.url)
