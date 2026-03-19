"""robinhood-for-agents — async Python client for the Robinhood trading API.

Usage::

    from robinhood_agents import RobinhoodClient

    async with RobinhoodClient() as client:
        await client.restore_session()
        quotes = await client.get_quotes("AAPL")

Or use the module-level singleton::

    from robinhood_agents import get_client

    client = get_client()
    await client.restore_session()
"""

from ._client import RobinhoodClient
from ._errors import (
    APIError,
    AuthenticationError,
    NotFoundError,
    NotLoggedInError,
    RateLimitError,
    RobinhoodError,
    TokenExpiredError,
)
from ._types import (
    Account,
    AccountNumber,
    ChainId,
    CryptoOrder,
    CryptoPair,
    CryptoPosition,
    CryptoQuote,
    Dividend,
    Earnings,
    Fundamental,
    HistoricalDataPoint,
    Holding,
    IndexInstrument,
    IndexValue,
    Instrument,
    InstrumentId,
    InvestmentProfile,
    LoginResult,
    MarketHours,
    News,
    OptionChain,
    OptionInstrument,
    OptionMarketData,
    OptionOrder,
    OptionPosition,
    OptionType,
    OrderDirection,
    OrderId,
    OrderSide,
    Portfolio,
    Position,
    PositionEffect,
    Quote,
    Rating,
    StockHistorical,
    StockOrder,
    UserProfile,
)

_default_client: RobinhoodClient | None = None


def get_client() -> RobinhoodClient:
    """Return a module-level singleton client (matches TypeScript ``getClient()``)."""
    global _default_client
    if _default_client is None:
        _default_client = RobinhoodClient()
    return _default_client


__all__ = [
    "APIError",
    "Account",
    "AccountNumber",
    "AuthenticationError",
    "ChainId",
    "CryptoOrder",
    "CryptoPair",
    "CryptoPosition",
    "CryptoQuote",
    "Dividend",
    "Earnings",
    "Fundamental",
    "HistoricalDataPoint",
    "Holding",
    "IndexInstrument",
    "IndexValue",
    "Instrument",
    "InstrumentId",
    "InvestmentProfile",
    "LoginResult",
    "MarketHours",
    "News",
    "NotFoundError",
    "NotLoggedInError",
    "OptionChain",
    "OptionInstrument",
    "OptionMarketData",
    "OptionOrder",
    "OptionPosition",
    "OptionType",
    "OrderDirection",
    "OrderId",
    "OrderSide",
    "Portfolio",
    "Position",
    "PositionEffect",
    "Quote",
    "RateLimitError",
    "Rating",
    "RobinhoodClient",
    "RobinhoodError",
    "StockHistorical",
    "StockOrder",
    "TokenExpiredError",
    "UserProfile",
    "get_client",
]
