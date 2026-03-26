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
from ._token_store import (
    EncryptedFileTokenStore,
    KeychainTokenStore,
    TokenData,
    TokenStore,
    create_token_store,
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


async def close_client() -> None:
    """Close the module-level singleton client, releasing its connection pool."""
    global _default_client
    if _default_client is not None:
        await _default_client.close()
        _default_client = None


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
    "EncryptedFileTokenStore",
    "Fundamental",
    "HistoricalDataPoint",
    "Holding",
    "IndexInstrument",
    "IndexValue",
    "Instrument",
    "InstrumentId",
    "InvestmentProfile",
    "KeychainTokenStore",
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
    "TokenData",
    "TokenExpiredError",
    "TokenStore",
    "UserProfile",
    "close_client",
    "create_token_store",
    "get_client",
]
