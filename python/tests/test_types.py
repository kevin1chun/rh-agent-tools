"""Tests for Pydantic models — validate parsing and extra field handling."""

from robinhood_agents._types import (
    Account,
    CryptoQuote,
    Holding,
    Instrument,
    LoginResult,
    OptionChain,
    Portfolio,
    Quote,
    StockOrder,
)


class TestAccountModel:
    def test_minimal(self) -> None:
        a = Account(url="https://example.com", account_number="ABC", type="individual")
        assert a.account_number == "ABC"

    def test_extra_fields_allowed(self) -> None:
        a = Account.model_validate(
            {
                "url": "https://example.com",
                "account_number": "ABC",
                "type": "individual",
                "unknown_field": "should be kept",
            }
        )
        assert a.account_number == "ABC"


class TestPortfolioModel:
    def test_nullable_fields(self) -> None:
        p = Portfolio(equity=None, market_value=None)
        assert p.equity is None

    def test_with_values(self) -> None:
        p = Portfolio(equity="1000.00", market_value="1500.00")
        assert p.equity == "1000.00"


class TestQuoteModel:
    def test_parse(self) -> None:
        q = Quote(
            symbol="AAPL",
            last_trade_price="150.00",
            ask_price="150.05",
            bid_price="149.95",
        )
        assert q.symbol == "AAPL"
        assert q.last_trade_price == "150.00"

    def test_nullable_price(self) -> None:
        q = Quote(symbol="X", last_trade_price=None, ask_price=None, bid_price=None)
        assert q.last_trade_price is None


class TestInstrumentModel:
    def test_parse(self) -> None:
        i = Instrument(
            url="https://example.com",
            id="abc",
            symbol="AAPL",
            name="Apple Inc.",
            type="stock",
        )
        assert i.symbol == "AAPL"
        assert i.simple_name is None


class TestStockOrderModel:
    def test_parse(self) -> None:
        o = StockOrder(id="123", state="filled")
        assert o.id == "123"
        assert o.cancel is None


class TestOptionChainModel:
    def test_parse(self) -> None:
        c = OptionChain(id="chain1", expiration_dates=["2024-01-19", "2024-02-16"])
        assert len(c.expiration_dates) == 2


class TestCryptoQuoteModel:
    def test_default(self) -> None:
        q = CryptoQuote(mark_price="0")
        assert q.mark_price == "0"


class TestHoldingModel:
    def test_parse(self) -> None:
        h = Holding(
            symbol="AAPL",
            name="Apple",
            quantity="10",
            average_buy_price="150",
            price="160",
            equity="1600",
        )
        assert h.symbol == "AAPL"


class TestLoginResult:
    def test_parse(self) -> None:
        r = LoginResult(status="logged_in", method="proxy")
        assert r.status == "logged_in"
