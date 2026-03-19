"""RobinhoodClient — the primary async interface for Robinhood API access.

All methods are async.  Call ``restore_session()`` before any data method.
Multi-account is first-class: account-scoped methods accept ``account_number``.
"""

import uuid
from typing import Self

from . import _urls as urls
from ._auth import logout as _logout
from ._auth import restore_session as _restore_session
from ._errors import NotFoundError, NotLoggedInError
from ._http import proxy_rewrite, request_get, request_post
from ._session import Session
from ._types import (
    Account,
    CryptoOrder,
    CryptoPosition,
    CryptoQuote,
    Earnings,
    Fundamental,
    HistoricalDataPoint,
    Holding,
    IndexInstrument,
    IndexValue,
    Instrument,
    InvestmentProfile,
    LoginResult,
    News,
    OptionChain,
    OptionInstrument,
    OptionMarketData,
    OptionOrder,
    Portfolio,
    Position,
    Quote,
    Rating,
    StockHistorical,
    StockOrder,
    UserProfile,
)

_MULTI_ACCOUNT_PARAMS: dict[str, str] = {
    "default_to_all_accounts": "true",
    "include_managed": "true",
    "include_multiple_individual": "true",
}


def _normalize_symbols(symbols: str | list[str]) -> list[str]:
    if isinstance(symbols, str):
        return [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return [s.strip().upper() for s in symbols]


class RobinhoodClient:
    """Async Robinhood API client.

    Usage::

        async with RobinhoodClient() as client:
            await client.restore_session()
            quotes = await client.get_quotes("AAPL")
    """

    def __init__(self, *, timeout: float = 16.0) -> None:
        self._session = Session(timeout)
        self._logged_in = False
        self._index_cache: dict[str, IndexInstrument] | None = None

    @property
    def is_logged_in(self) -> bool:
        return self._logged_in

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._session.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    # -----------------------------------------------------------------------
    # Auth
    # -----------------------------------------------------------------------

    async def restore_session(self) -> LoginResult:
        result = await _restore_session(self._session)
        self._logged_in = True
        return result

    async def logout(self) -> None:
        await _logout(self._session)
        self._logged_in = False

    def _require_auth(self) -> None:
        if not self._logged_in:
            raise NotLoggedInError()

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _resolve_account_url(self, account_number: str | None = None) -> str:
        if account_number:
            return urls.account(account_number)
        accts = await self.get_accounts()
        if not accts:
            raise NotFoundError("No brokerage account found")
        return accts[0].url

    # -----------------------------------------------------------------------
    # Accounts & Profiles
    # -----------------------------------------------------------------------

    async def get_accounts(self, *, all_accounts: bool = True) -> list[Account]:
        self._require_auth()
        params = {**_MULTI_ACCOUNT_PARAMS} if all_accounts else {}
        raw = await request_get(self._session, urls.accounts(), data_type="results", params=params)
        return [Account.model_validate(a) for a in raw]

    async def get_account_profile(self, account_number: str | None = None) -> Account:
        self._require_auth()
        if account_number:
            raw = await request_get(self._session, urls.account(account_number))
            return Account.model_validate(raw)
        accts = await self.get_accounts()
        return accts[0]

    async def get_portfolio_profile(self, account_number: str | None = None) -> Portfolio:
        self._require_auth()
        if account_number:
            raw = await request_get(self._session, urls.portfolio(account_number))
            return Portfolio.model_validate(raw)
        raw = await request_get(self._session, urls.portfolios(), data_type="indexzero")
        return Portfolio.model_validate(raw)

    async def get_user_profile(self) -> UserProfile:
        self._require_auth()
        raw = await request_get(self._session, urls.user())
        return UserProfile.model_validate(raw)

    async def get_investment_profile(self) -> InvestmentProfile:
        self._require_auth()
        raw = await request_get(self._session, urls.investment_profile())
        return InvestmentProfile.model_validate(raw)

    # -----------------------------------------------------------------------
    # Positions & Holdings
    # -----------------------------------------------------------------------

    async def get_positions(
        self,
        *,
        account_number: str | None = None,
        nonzero: bool = False,
    ) -> list[Position]:
        self._require_auth()
        params = {**_MULTI_ACCOUNT_PARAMS}
        if nonzero:
            params["nonzero"] = "true"
        if account_number:
            params["account_number"] = account_number
        raw = await request_get(
            self._session, urls.positions(), data_type="pagination", params=params
        )
        return [Position.model_validate(p) for p in raw]

    async def get_instrument_by_url(self, url: str) -> Instrument:
        self._require_auth()
        rewritten = proxy_rewrite(url)
        if not rewritten.startswith(urls.API_BASE):
            msg = f"Refusing to fetch instrument from untrusted URL: {url}"
            raise RuntimeError(msg)
        raw = await request_get(self._session, rewritten)
        return Instrument.model_validate(raw)

    async def build_holdings(
        self,
        *,
        account_number: str | None = None,
        with_dividends: bool = False,
    ) -> dict[str, Holding]:
        self._require_auth()
        pos_list = await self.get_positions(account_number=account_number, nonzero=True)
        if not pos_list:
            return {}

        instrument_list: list[Instrument] = []
        for pos in pos_list:
            inst = await self.get_instrument_by_url(pos.instrument)
            instrument_list.append(inst)

        symbol_list = [i.symbol for i in instrument_list]
        quote_list = await self.get_quotes(symbol_list)

        dividend_map: dict[str, str | None] = {}
        if with_dividends:
            fundies = await self.get_fundamentals(symbol_list)
            for f in fundies:
                if f.symbol:
                    dividend_map[f.symbol] = f.dividend_yield

        holdings: dict[str, Holding] = {}
        for i, pos in enumerate(pos_list):
            inst = instrument_list[i]
            q = next((q for q in quote_list if q.symbol == inst.symbol), None)

            quantity = float(pos.quantity)
            avg_cost = float(pos.average_buy_price)
            price = float(q.last_trade_price or "0") if q else 0.0
            equity = quantity * price
            equity_change = equity - quantity * avg_cost
            percent_change = ((price - avg_cost) / avg_cost * 100) if avg_cost > 0 else 0.0

            holding = Holding(
                symbol=inst.symbol,
                name=inst.simple_name or inst.name,
                quantity=str(quantity),
                average_buy_price=str(avg_cost),
                price=str(price),
                equity=str(equity),
                equity_change=str(equity_change),
                percent_change=str(percent_change),
                pe_ratio=q.pe_ratio if q else None,
                dividend_rate=dividend_map.get(inst.symbol) if with_dividends else None,
            )
            holdings[inst.symbol] = holding

        return holdings

    # -----------------------------------------------------------------------
    # Quotes & Fundamentals
    # -----------------------------------------------------------------------

    async def get_quotes(self, symbols: str | list[str]) -> list[Quote]:
        self._require_auth()
        sym_list = _normalize_symbols(symbols)
        raw = await request_get(
            self._session,
            urls.quotes(),
            data_type="results",
            params={"symbols": ",".join(sym_list)},
        )
        return [Quote.model_validate(q) for q in raw]

    async def get_latest_price(
        self, symbols: list[str], *, price_type: str | None = None
    ) -> list[str]:
        self._require_auth()
        quote_list = await self.get_quotes(symbols)
        field = price_type or "last_trade_price"
        return [str(getattr(q, field, None) or q.last_trade_price or "0") for q in quote_list]

    async def get_fundamentals(self, symbols: list[str]) -> list[Fundamental]:
        self._require_auth()
        sym_list = [s.strip().upper() for s in symbols]
        raw = await request_get(
            self._session,
            urls.fundamentals(),
            data_type="results",
            params={"symbols": ",".join(sym_list)},
        )
        return [Fundamental.model_validate(f) for f in raw]

    async def get_stock_historicals(
        self,
        symbols: str | list[str],
        *,
        interval: str = "day",
        span: str = "month",
        bounds: str = "regular",
    ) -> list[StockHistorical]:
        self._require_auth()
        sym_list = _normalize_symbols(symbols)
        raw = await request_get(
            self._session,
            urls.stock_historicals(),
            data_type="results",
            params={
                "symbols": ",".join(sym_list),
                "interval": interval,
                "span": span,
                "bounds": bounds,
            },
        )
        return [StockHistorical.model_validate(h) for h in raw]

    # -----------------------------------------------------------------------
    # News, Ratings, Earnings
    # -----------------------------------------------------------------------

    async def get_news(self, symbol: str) -> list[News]:
        self._require_auth()
        raw = await request_get(self._session, urls.news(symbol), data_type="results")
        return [News.model_validate(n) for n in raw]

    async def get_ratings(self, symbol: str) -> Rating:
        self._require_auth()
        insts = await self.find_instruments(symbol)
        if not insts:
            return Rating()
        raw = await request_get(self._session, urls.ratings(insts[0].id))
        return Rating.model_validate(raw)

    async def get_earnings(self, symbol: str) -> list[Earnings]:
        self._require_auth()
        insts = await self.find_instruments(symbol)
        if not insts:
            return []
        raw = await request_get(
            self._session,
            urls.earnings(),
            data_type="results",
            params={"symbol": symbol.upper()},
        )
        return [Earnings.model_validate(e) for e in raw]

    # -----------------------------------------------------------------------
    # Indexes
    # -----------------------------------------------------------------------

    async def _get_indexes(self) -> dict[str, IndexInstrument]:
        if self._index_cache is not None:
            return self._index_cache
        self._require_auth()
        raw = await request_get(self._session, urls.indexes(), data_type="results")
        self._index_cache = {}
        for idx in raw:
            parsed = IndexInstrument.model_validate(idx)
            self._index_cache[parsed.symbol.upper()] = parsed
        return self._index_cache

    async def get_index_value(self, symbol: str) -> IndexValue | None:
        self._require_auth()
        index_map = await self._get_indexes()
        index = index_map.get(symbol.upper())
        if not index:
            return None
        resp = await request_get(self._session, urls.index_values(), params={"ids": index.id})
        data_list = resp.get("data", []) if isinstance(resp, dict) else []
        if data_list and isinstance(data_list[0], dict):
            inner = data_list[0].get("data")
            if inner:
                return IndexValue.model_validate(inner)
        return None

    # -----------------------------------------------------------------------
    # Options
    # -----------------------------------------------------------------------

    async def get_chains(self, symbol: str, *, expiration_date: str | None = None) -> OptionChain:
        self._require_auth()
        sym = symbol.upper()
        empty = OptionChain(id="", expiration_dates=[])

        index_map = await self._get_indexes()
        index = index_map.get(sym)
        if index and index.tradable_chain_ids:
            raw = await request_get(
                self._session,
                urls.option_chains(),
                data_type="results",
                params={"ids": ",".join(index.tradable_chain_ids)},
            )
            chains = [OptionChain.model_validate(c) for c in raw]
            if not chains:
                return empty
            if len(chains) == 1:
                return chains[0]
            if expiration_date:
                matching = [c for c in chains if expiration_date in c.expiration_dates]
                if matching:
                    return matching[0]
            chains.sort(key=lambda c: len(c.expiration_dates), reverse=True)
            return chains[0]

        insts = await self.find_instruments(sym)
        inst = next((i for i in insts if i.symbol == sym), None)
        if not inst:
            return empty
        raw = await request_get(
            self._session,
            urls.option_chains(),
            data_type="results",
            params={"equity_instrument_ids": inst.id, "state": "active"},
        )
        chains = [OptionChain.model_validate(c) for c in raw]
        return chains[0] if chains else empty

    async def find_tradable_options(
        self,
        symbol: str,
        *,
        expiration_date: str | None = None,
        strike_price: float | None = None,
        option_type: str | None = None,
    ) -> list[OptionInstrument]:
        self._require_auth()
        chain = await self.get_chains(symbol, expiration_date=expiration_date)
        params: dict[str, str] = {"chain_id": chain.id}
        if expiration_date:
            params["expiration_dates"] = expiration_date
        if strike_price is not None:
            params["strike_price"] = str(strike_price)
        if option_type:
            params["type"] = option_type

        raw = await request_get(
            self._session, urls.option_instruments(), data_type="pagination", params=params
        )
        results = [OptionInstrument.model_validate(o) for o in raw]

        # Client-side filtering — the API doesn't always honor query params
        if expiration_date:
            results = [o for o in results if o.expiration_date == expiration_date]
        if strike_price is not None:
            results = [o for o in results if float(o.strike_price) == strike_price]
        if option_type:
            results = [o for o in results if o.type == option_type]

        return results

    async def get_option_market_data(
        self,
        symbol: str,
        expiration_date: str,
        strike_price: float,
        option_type: str,
    ) -> list[OptionMarketData]:
        self._require_auth()
        options = await self.find_tradable_options(
            symbol,
            expiration_date=expiration_date,
            strike_price=strike_price,
            option_type=option_type,
        )
        if not options:
            return []
        results: list[OptionMarketData] = []
        for opt in options:
            raw = await request_get(self._session, urls.option_market_data(opt.id))
            results.append(OptionMarketData.model_validate(raw))
        return results

    # -----------------------------------------------------------------------
    # Crypto
    # -----------------------------------------------------------------------

    async def get_crypto_quote(self, symbol: str) -> CryptoQuote:
        self._require_auth()
        raw = await request_get(self._session, urls.crypto_currency_pairs(), data_type="results")
        sym_upper = symbol.upper()
        pair = next(
            (p for p in raw if p.get("asset_currency", {}).get("code", "").upper() == sym_upper),
            None,
        )
        if not pair:
            return CryptoQuote(mark_price="0")
        raw_quote = await request_get(self._session, urls.crypto_quote(pair["id"]))
        return CryptoQuote.model_validate(raw_quote)

    async def get_crypto_historicals(
        self,
        symbol: str,
        *,
        interval: str = "day",
        span: str = "month",
        bounds: str = "24_7",
    ) -> list[HistoricalDataPoint]:
        self._require_auth()
        raw = await request_get(self._session, urls.crypto_currency_pairs(), data_type="results")
        sym_upper = symbol.upper()
        pair = next(
            (p for p in raw if p.get("asset_currency", {}).get("code", "").upper() == sym_upper),
            None,
        )
        if not pair:
            return []
        raw_hist = await request_get(
            self._session,
            urls.crypto_historicals(pair["id"]),
            data_type="results",
            params={"interval": interval, "span": span, "bounds": bounds},
        )
        return [HistoricalDataPoint.model_validate(h) for h in raw_hist]

    async def get_crypto_positions(self) -> list[CryptoPosition]:
        from ._types import CryptoPosition

        self._require_auth()
        raw = await request_get(self._session, urls.crypto_holdings(), data_type="results")
        return [CryptoPosition.model_validate(p) for p in raw]

    # -----------------------------------------------------------------------
    # Stock Orders
    # -----------------------------------------------------------------------

    async def get_all_stock_orders(self, *, account_number: str | None = None) -> list[StockOrder]:
        self._require_auth()
        params: dict[str, str] = {}
        if account_number:
            params["account_number"] = account_number
        raw = await request_get(
            self._session, urls.stock_orders(), data_type="pagination", params=params
        )
        return [StockOrder.model_validate(o) for o in raw]

    async def get_open_stock_orders(self, *, account_number: str | None = None) -> list[StockOrder]:
        all_orders = await self.get_all_stock_orders(account_number=account_number)
        return [o for o in all_orders if o.cancel is not None]

    async def get_stock_order(self, order_id: str) -> StockOrder:
        self._require_auth()
        raw = await request_get(self._session, urls.stock_order(order_id))
        return StockOrder.model_validate(raw)

    async def order_stock(
        self,
        symbol: str,
        side: str,
        quantity: float,
        *,
        limit_price: float | None = None,
        stop_price: float | None = None,
        trail_amount: float | None = None,
        trail_type: str | None = None,
        time_in_force: str | None = None,
        extended_hours: bool = False,
        account_number: str | None = None,
    ) -> StockOrder:
        self._require_auth()
        sym = symbol.strip().upper()

        # Validate mutually exclusive order params
        if trail_amount is not None and (limit_price is not None or stop_price is not None):
            msg = "Cannot combine trail_amount with limit_price or stop_price"
            raise ValueError(msg)

        is_fractional = not float(quantity).is_integer()
        if is_fractional and any(p is not None for p in (limit_price, stop_price, trail_amount)):
            msg = "Fractional orders must be market orders (no limit, stop, or trailing stop)"
            raise ValueError(msg)

        insts = await self.find_instruments(sym)
        if not insts:
            raise NotFoundError(f"Instrument not found: {sym}")
        inst = insts[0]

        # Determine order type and trigger
        if trail_amount is not None:
            order_type, trigger = "market", "stop"
        elif stop_price is not None and limit_price is not None:
            order_type, trigger = "limit", "stop"
        elif stop_price is not None:
            order_type, trigger = "market", "stop"
        elif limit_price is not None:
            order_type, trigger = "limit", "immediate"
        else:
            order_type, trigger = "market", "immediate"

        account_url = await self._resolve_account_url(account_number)

        payload: dict[str, object] = {
            "account": account_url,
            "instrument": inst.url,
            "symbol": sym,
            "side": side,
            "quantity": str(quantity),
            "type": order_type,
            "trigger": trigger,
            "time_in_force": "gfd" if is_fractional else (time_in_force or "gtc"),
            "extended_hours": extended_hours,
            "ref_id": str(uuid.uuid4()),
        }

        if limit_price is not None:
            payload["price"] = str(limit_price)
        if stop_price is not None:
            payload["stop_price"] = str(stop_price)
        if trail_amount is not None:
            t_type = trail_type or "percentage"
            payload["trailing_peg"] = {
                "type": t_type,
                "percentage": str(trail_amount) if t_type != "amount" else None,
                "price": {"amount": str(trail_amount)} if t_type == "amount" else None,
            }

        # Market buys get a 5% price collar
        if order_type == "market" and side == "buy" and trigger == "immediate":
            payload["preset_percent_limit"] = "0.05"

        raw = await request_post(self._session, urls.stock_orders(), payload=payload, as_json=True)
        return StockOrder.model_validate(raw)

    async def cancel_stock_order(self, order_id: str) -> None:
        self._require_auth()
        await request_post(self._session, urls.cancel_stock_order(order_id))

    # -----------------------------------------------------------------------
    # Option Orders
    # -----------------------------------------------------------------------

    async def get_all_option_orders(
        self, *, account_number: str | None = None
    ) -> list[OptionOrder]:
        self._require_auth()
        params: dict[str, str] = {}
        if account_number:
            params["account_number"] = account_number
        raw = await request_get(
            self._session, urls.option_orders(), data_type="pagination", params=params
        )
        return [OptionOrder.model_validate(o) for o in raw]

    async def get_open_option_orders(
        self, *, account_number: str | None = None
    ) -> list[OptionOrder]:
        all_orders = await self.get_all_option_orders(account_number=account_number)
        return [o for o in all_orders if o.cancel_url is not None]

    async def get_option_order(self, order_id: str) -> OptionOrder:
        self._require_auth()
        raw = await request_get(self._session, urls.option_order(order_id))
        return OptionOrder.model_validate(raw)

    async def order_option(
        self,
        symbol: str,
        legs: list[dict[str, object]],
        price: float,
        quantity: int,
        direction: str,
        *,
        stop_price: float | None = None,
        time_in_force: str = "gfd",
        account_number: str | None = None,
    ) -> OptionOrder:
        self._require_auth()
        if not legs:
            msg = "At least one leg is required"
            raise ValueError(msg)

        resolved_legs = []
        for leg in legs:
            options = await self.find_tradable_options(
                symbol,
                expiration_date=str(leg["expiration_date"]),
                strike_price=float(str(leg["strike"])),
                option_type=str(leg["option_type"]),
            )
            if not options:
                raise NotFoundError(
                    f"No tradable option found: {symbol} {leg['expiration_date']} "
                    f"{leg['strike']} {leg['option_type']}"
                )
            opt = options[0]
            resolved_legs.append(
                {
                    "option_id": opt.id,
                    "side": leg["side"],
                    "position_effect": leg["position_effect"],
                    "ratio_quantity": leg.get("ratio_quantity", 1),
                }
            )

        account_url = await self._resolve_account_url(account_number)

        payload: dict[str, object] = {
            "account": account_url,
            "direction": direction,
            "legs": resolved_legs,
            "price": str(price),
            "quantity": str(quantity),
            "type": "limit",
            "time_in_force": time_in_force,
            "trigger": "stop" if stop_price is not None else "immediate",
            "market_hours": "regular_hours",
            "override_day_trade_checks": True,
            "override_dtbp_checks": True,
            "ref_id": str(uuid.uuid4()),
        }

        if stop_price is not None:
            payload["stop_price"] = str(stop_price)

        raw = await request_post(self._session, urls.option_orders(), payload=payload, as_json=True)
        return OptionOrder.model_validate(raw)

    async def cancel_option_order(self, order_id: str) -> None:
        self._require_auth()
        await request_post(self._session, urls.cancel_option_order(order_id))

    # -----------------------------------------------------------------------
    # Crypto Orders
    # -----------------------------------------------------------------------

    async def get_all_crypto_orders(
        self, *, account_number: str | None = None
    ) -> list[CryptoOrder]:
        self._require_auth()
        params: dict[str, str] = {}
        if account_number:
            params["account_number"] = account_number
        raw = await request_get(
            self._session, urls.crypto_orders(), data_type="pagination", params=params
        )
        return [CryptoOrder.model_validate(o) for o in raw]

    async def get_open_crypto_orders(
        self, *, account_number: str | None = None
    ) -> list[CryptoOrder]:
        all_orders = await self.get_all_crypto_orders(account_number=account_number)
        return [o for o in all_orders if o.state in ("unconfirmed", "confirmed")]

    async def get_crypto_order(self, order_id: str) -> CryptoOrder:
        self._require_auth()
        raw = await request_get(self._session, urls.crypto_order(order_id))
        return CryptoOrder.model_validate(raw)

    async def order_crypto(
        self,
        symbol: str,
        side: str,
        amount_or_quantity: float,
        *,
        amount_in: str = "quantity",
        order_type: str = "market",
        limit_price: float | None = None,
    ) -> CryptoOrder:
        self._require_auth()
        s = symbol.strip().upper()

        raw = await request_get(self._session, urls.crypto_currency_pairs(), data_type="results")
        pair = next(
            (p for p in raw if p.get("asset_currency", {}).get("code", "").upper() == s),
            None,
        )
        if not pair:
            raise NotFoundError(f"Crypto pair not found: {s}")

        payload: dict[str, object] = {
            "currency_pair_id": pair["id"],
            "side": side,
            "type": order_type,
            "time_in_force": "gtc",
            "ref_id": str(uuid.uuid4()),
        }

        if amount_in == "quantity":
            payload["quantity"] = str(amount_or_quantity)
        elif limit_price is not None:
            payload["quantity"] = str(amount_or_quantity / limit_price)
        else:
            payload["price"] = str(amount_or_quantity)

        if limit_price is not None:
            payload["price"] = str(limit_price)
            payload["type"] = "limit"

        raw_order = await request_post(
            self._session, urls.crypto_orders(), payload=payload, as_json=True
        )
        return CryptoOrder.model_validate(raw_order)

    async def cancel_crypto_order(self, order_id: str) -> None:
        self._require_auth()
        await request_post(self._session, urls.cancel_crypto_order(order_id))

    # -----------------------------------------------------------------------
    # Markets & Search
    # -----------------------------------------------------------------------

    async def get_top_movers(self) -> list[Instrument]:
        self._require_auth()
        data = await request_get(self._session, urls.top_movers())
        results: list[Instrument] = []
        for url in data.get("instruments", []):
            results.append(await self.get_instrument_by_url(url))
        return results

    async def get_top_movers_sp500(self, direction: str) -> list[Instrument]:
        self._require_auth()
        raw = await request_get(
            self._session,
            urls.top_movers_sp500(),
            data_type="results",
            params={"direction": direction},
        )
        return [Instrument.model_validate(i) for i in raw]

    async def get_top_100(self) -> list[Instrument]:
        self._require_auth()
        data = await request_get(self._session, urls.top_100())
        results: list[Instrument] = []
        for url in data.get("instruments", []):
            results.append(await self.get_instrument_by_url(url))
        return results

    async def find_instruments(self, query: str) -> list[Instrument]:
        self._require_auth()
        raw = await request_get(
            self._session,
            urls.instruments(),
            data_type="results",
            params={"query": query.strip()},
        )
        return [Instrument.model_validate(i) for i in raw]

    async def get_all_stocks_from_market_tag(self, tag: str) -> list[Instrument]:
        self._require_auth()
        data = await request_get(self._session, urls.tags(tag))
        results: list[Instrument] = []
        for url in data.get("instruments", []):
            results.append(await self.get_instrument_by_url(url))
        return results
