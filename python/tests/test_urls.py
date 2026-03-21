"""Tests for URL builders."""

import pytest

from robinhood_agents._urls import (
    account,
    accounts,
    cancel_crypto_order,
    cancel_option_order,
    cancel_stock_order,
    crypto_currency_pairs,
    crypto_holdings,
    crypto_orders,
    fundamental,
    market_hours,
    news,
    oauth_revoke,
    oauth_token,
    quote,
    tags,
)


class TestUrlBuilders:
    def test_accounts(self) -> None:
        assert accounts() == "https://api.robinhood.com/accounts/"

    def test_account(self) -> None:
        assert account("ABC123") == "https://api.robinhood.com/accounts/ABC123/"

    def test_oauth_token(self) -> None:
        assert oauth_token() == "https://api.robinhood.com/oauth2/token/"

    def test_oauth_revoke(self) -> None:
        assert oauth_revoke() == "https://api.robinhood.com/oauth2/revoke_token/"

    def test_quote_uppercases(self) -> None:
        assert quote("aapl") == "https://api.robinhood.com/quotes/AAPL/"

    def test_news_uppercases(self) -> None:
        assert news("msft") == "https://api.robinhood.com/midlands/news/MSFT/"

    def test_fundamental_uppercases(self) -> None:
        assert fundamental("tsla") == "https://api.robinhood.com/fundamentals/TSLA/"

    def test_crypto_uses_nummus(self) -> None:
        assert crypto_currency_pairs() == "https://nummus.robinhood.com/currency_pairs/"
        assert crypto_holdings() == "https://nummus.robinhood.com/holdings/"
        assert crypto_orders() == "https://nummus.robinhood.com/orders/"

    def test_cancel_urls(self) -> None:
        assert cancel_stock_order("abc") == "https://api.robinhood.com/orders/abc/cancel/"
        assert cancel_option_order("def") == "https://api.robinhood.com/options/orders/def/cancel/"
        assert cancel_crypto_order("ghi") == "https://nummus.robinhood.com/orders/ghi/cancel/"

    def test_tags_validates(self) -> None:
        assert tags("top-movers") == "https://api.robinhood.com/midlands/tags/tag/top-movers/"
        with pytest.raises(ValueError, match="Invalid tag"):
            tags("../../etc/passwd")

    def test_market_hours_validates(self) -> None:
        assert "XNYS" in market_hours("XNYS", "2024-01-15")
        with pytest.raises(ValueError, match="Invalid market"):
            market_hours("../bad", "2024-01-15")
