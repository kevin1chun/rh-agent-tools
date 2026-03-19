"""Pydantic v2 models for Robinhood API responses.

Prices and quantities are strings (not floats) because
Robinhood returns them as fixed-precision strings for accuracy.
"""

from enum import StrEnum
from typing import Literal, NewType

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Branded types (zero runtime cost)
# ---------------------------------------------------------------------------

AccountNumber = NewType("AccountNumber", str)
OrderId = NewType("OrderId", str)
InstrumentId = NewType("InstrumentId", str)
ChainId = NewType("ChainId", str)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class OrderSide(StrEnum):
    BUY = "buy"
    SELL = "sell"


class OptionType(StrEnum):
    CALL = "call"
    PUT = "put"


class OrderDirection(StrEnum):
    DEBIT = "debit"
    CREDIT = "credit"


class PositionEffect(StrEnum):
    OPEN = "open"
    CLOSE = "close"


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

type DataType = Literal["regular", "results", "indexzero", "pagination"]


# ---------------------------------------------------------------------------
# Base config — extra="allow" matches Zod passthrough behavior
# ---------------------------------------------------------------------------


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginResult(_Base):
    status: Literal["logged_in"]
    method: Literal["proxy"]


# ---------------------------------------------------------------------------
# Accounts & Profiles
# ---------------------------------------------------------------------------


class Account(_Base):
    url: str
    account_number: str
    type: str
    cash: str | None = None
    buying_power: str | None = None
    crypto_buying_power: str | None = None
    cash_available_for_withdrawal: str | None = None
    portfolio_cash: str | None = None
    can_downgrade_to_cash: str | None = None


class Portfolio(_Base):
    equity: str | None
    market_value: str | None
    excess_margin: str | None = None
    extended_hours_equity: str | None = None
    extended_hours_market_value: str | None = None
    last_core_equity: str | None = None
    last_core_market_value: str | None = None


class UserProfile(_Base):
    username: str
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    id_info: str | None = None
    url: str | None = None


class InvestmentProfile(_Base):
    risk_tolerance: str | None = None
    total_net_worth: str | None = None
    annual_income: str | None = None
    liquid_net_worth: str | None = None
    investment_experience: str | None = None
    investment_objective: str | None = None
    source_of_funds: str | None = None
    time_horizon: str | None = None
    liquidity_needs: str | None = None
    tax_bracket: str | None = None


# ---------------------------------------------------------------------------
# Positions & Holdings
# ---------------------------------------------------------------------------


class Position(_Base):
    instrument: str
    quantity: str
    average_buy_price: str
    account_number: str | None = None
    intraday_quantity: str | None = None
    intraday_average_buy_price: str | None = None
    shares_held_for_buys: str | None = None
    shares_held_for_sells: str | None = None
    shares_available_for_exercise: str | None = None
    url: str | None = None


class Holding(_Base):
    symbol: str
    name: str
    quantity: str
    average_buy_price: str
    price: str
    equity: str
    percent_change: str | None = None
    equity_change: str | None = None
    pe_ratio: str | None = None
    dividend_rate: str | None = None


# ---------------------------------------------------------------------------
# Instruments
# ---------------------------------------------------------------------------


class Instrument(_Base):
    url: str
    id: str
    symbol: str
    simple_name: str | None = None
    name: str
    type: str
    tradability: str | None = None
    tradeable: bool | None = None
    country: str | None = None
    market: str | None = None


# ---------------------------------------------------------------------------
# Quotes & Fundamentals
# ---------------------------------------------------------------------------


class Quote(_Base):
    symbol: str
    last_trade_price: str | None
    ask_price: str | None
    bid_price: str | None
    adjusted_previous_close: str | None = None
    previous_close: str | None = None
    pe_ratio: str | None = None
    last_extended_hours_trade_price: str | None = None
    trading_halted: bool | None = None
    has_traded: bool | None = None
    updated_at: str | None = None


class Fundamental(_Base):
    symbol: str | None = None
    pe_ratio: str | None = None
    dividend_yield: str | None = None
    market_cap: str | None = None
    high: str | None = None
    low: str | None = None
    high_52_weeks: str | None = None
    low_52_weeks: str | None = None
    average_volume: str | None = None
    average_volume_2_weeks: str | None = None
    shares_outstanding: str | None = None
    description: str | None = None
    ceo: str | None = None
    headquarters_city: str | None = None
    headquarters_state: str | None = None
    sector: str | None = None
    industry: str | None = None
    num_employees: int | None = None
    year_founded: int | None = None


# ---------------------------------------------------------------------------
# Historicals
# ---------------------------------------------------------------------------


class HistoricalDataPoint(_Base):
    begins_at: str
    open_price: str | None = None
    close_price: str | None = None
    high_price: str | None = None
    low_price: str | None = None
    volume: int | None = None
    interpolated: bool | None = None
    session: str | None = None


class StockHistorical(_Base):
    symbol: str
    historicals: list[HistoricalDataPoint]
    bounds: str | None = None
    span: str | None = None
    interval: str | None = None


# ---------------------------------------------------------------------------
# News, Ratings, Earnings
# ---------------------------------------------------------------------------


class News(_Base):
    title: str
    source: str | None = None
    published_at: str | None = None
    url: str | None = None
    summary: str | None = None
    preview_image_url: str | None = None
    relay_url: str | None = None
    api_source: str | None = None


class RatingSummary(_Base):
    num_buy_ratings: int | None = None
    num_hold_ratings: int | None = None
    num_sell_ratings: int | None = None


class RatingEntry(_Base):
    published_at: str | None = None
    type: str | None = None
    text: str | None = None


class Rating(_Base):
    summary: RatingSummary | None = None
    ratings: list[RatingEntry] | None = None
    instrument_id: str | None = None


class EarningsReport(_Base):
    date: str | None = None
    timing: str | None = None
    verified: bool | None = None


class Earnings(_Base):
    symbol: str | None = None
    report: EarningsReport | None = None
    estimate: str | None = None
    actual: str | None = None
    year: int | None = None
    quarter: int | None = None


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------


class UnderlyingInstrument(_Base):
    id: str | None = None
    instrument: str | None = None
    quantity: int | None = None


class MinTicks(_Base):
    above_tick: str | None = None
    below_tick: str | None = None
    cutoff_price: str | None = None


class OptionChain(_Base):
    id: str
    expiration_dates: list[str]
    symbol: str | None = None
    can_open_position: bool | None = None
    underlying_instruments: list[UnderlyingInstrument] | None = None
    min_ticks: MinTicks | None = None


class OptionInstrument(_Base):
    url: str
    id: str
    type: str
    strike_price: str
    expiration_date: str
    state: str | None = None
    tradability: str | None = None
    chain_id: str | None = None
    chain_symbol: str | None = None
    issue_date: str | None = None


class OptionMarketData(_Base):
    implied_volatility: str | None = None
    delta: str | None = None
    gamma: str | None = None
    theta: str | None = None
    vega: str | None = None
    rho: str | None = None
    mark_price: str | None = None
    ask_price: str | None = None
    bid_price: str | None = None
    high_price: str | None = None
    low_price: str | None = None
    last_trade_price: str | None = None
    open_interest: int | None = None
    volume: int | None = None
    chance_of_profit_short: str | None = None
    chance_of_profit_long: str | None = None
    break_even_price: str | None = None


class OptionPosition(_Base):
    url: str | None = None
    option: str | None = None
    quantity: str | None = None
    average_price: str | None = None
    type: str | None = None
    chain_id: str | None = None
    chain_symbol: str | None = None


# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------


class IndexInstrument(_Base):
    id: str
    symbol: str
    simple_name: str | None = None
    state: str | None = None
    tradable_chain_ids: list[str] | None = None


class IndexValue(_Base):
    value: str | None = None
    symbol: str | None = None
    instrument_id: str | None = None
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# Stock Orders
# ---------------------------------------------------------------------------


class TrailingPegPrice(_Base):
    amount: str | None = None


class TrailingPeg(_Base):
    type: str | None = None
    percentage: str | None = None
    price: TrailingPegPrice | None = None


class StockOrder(_Base):
    id: str
    cancel: str | None = None
    state: str
    side: str | None = None
    quantity: str | None = None
    price: str | None = None
    average_price: str | None = None
    type: str | None = None
    trigger: str | None = None
    stop_price: str | None = None
    time_in_force: str | None = None
    instrument: str | None = None
    executions: list[dict[str, object]] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    last_transaction_at: str | None = None
    cumulative_quantity: str | None = None
    fees: str | None = None
    extended_hours: bool | None = None
    trailing_peg: TrailingPeg | None = None
    ref_id: str | None = None


# ---------------------------------------------------------------------------
# Option Orders
# ---------------------------------------------------------------------------


class OptionLeg(_Base):
    option: str | None = None
    side: str | None = None
    position_effect: str | None = None
    ratio_quantity: int | None = None
    expiration_date: str | None = None
    strike_price: str | None = None
    option_type: str | None = None


class OptionOrder(_Base):
    id: str
    cancel_url: str | None = None
    state: str
    direction: str | None = None
    premium: str | None = None
    price: str | None = None
    quantity: str | None = None
    type: str | None = None
    trigger: str | None = None
    stop_price: str | None = None
    time_in_force: str | None = None
    strategy: str | None = None
    opening_strategy: str | None = None
    closing_strategy: str | None = None
    legs: list[OptionLeg] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    ref_id: str | None = None
    chain_symbol: str | None = None


# ---------------------------------------------------------------------------
# Crypto
# ---------------------------------------------------------------------------


class CryptoAssetCurrency(_Base):
    code: str
    name: str | None = None


class CryptoPair(_Base):
    id: str
    asset_currency: CryptoAssetCurrency | None = None
    display_name: str | None = None
    symbol: str | None = None
    tradability: str | None = None


class CryptoQuote(_Base):
    mark_price: str | None = None
    ask_price: str | None = None
    bid_price: str | None = None
    high_price: str | None = None
    low_price: str | None = None
    open_price: str | None = None
    volume: str | None = None
    symbol: str | None = None
    id: str | None = None


class CryptoCostBasis(_Base):
    direct_cost_basis: str | None = None


class CryptoPositionCurrency(_Base):
    code: str
    name: str | None = None


class CryptoPosition(_Base):
    currency: CryptoPositionCurrency
    quantity_available: str | None = None
    quantity: str | None = None
    cost_bases: list[CryptoCostBasis] | None = None
    id: str | None = None


class CryptoOrder(_Base):
    id: str
    state: str
    side: str | None = None
    quantity: str | None = None
    price: str | None = None
    type: str | None = None
    currency_pair_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    cumulative_quantity: str | None = None


# ---------------------------------------------------------------------------
# Markets & Dividends
# ---------------------------------------------------------------------------


class MarketHours(_Base):
    is_open: bool
    opens_at: str | None = None
    closes_at: str | None = None
    extended_opens_at: str | None = None
    extended_closes_at: str | None = None
    date: str | None = None


class Dividend(_Base):
    id: str | None = None
    url: str | None = None
    amount: str | None = None
    rate: str | None = None
    position: str | None = None
    instrument: str | None = None
    payable_date: str | None = None
    record_date: str | None = None
    state: str | None = None
