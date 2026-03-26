/**
 * RobinhoodClient — the primary interface for Robinhood API access.
 *
 * All methods are async. Call `restoreSession()` before any data method.
 * Multi-account is first-class: account-scoped methods accept `accountNumber`.
 */

import type { LoginResult } from "./auth.js";
import { logout as logoutFn, restoreSession as restoreSessionFn } from "./auth.js";
import { NotFoundError, NotLoggedInError } from "./errors.js";
import { requestGet, requestPost } from "./http.js";
import { createSession, type RobinhoodSession } from "./session.js";
import type {
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
} from "./types.js";
import * as urls from "./urls.js";

const MULTI_ACCOUNT_PARAMS: Record<string, string> = {
  default_to_all_accounts: "true",
  include_managed: "true",
  include_multiple_individual: "true",
};

export class RobinhoodClient {
  /** @internal Exposed for streaming module — do NOT use in LLM-facing code. */
  readonly _session: RobinhoodSession;
  private _loggedIn = false;
  private _indexCache: Map<string, IndexInstrument> | null = null;

  constructor(opts?: { timeoutMs?: number }) {
    this._session = createSession(opts);
  }

  get isLoggedIn(): boolean {
    return this._loggedIn;
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async restoreSession(): Promise<LoginResult> {
    const result = await restoreSessionFn(this._session);
    this._loggedIn = true;
    return result;
  }

  async logout(): Promise<void> {
    await logoutFn(this._session);
    this._loggedIn = false;
  }

  private requireAuth(): void {
    if (!this._loggedIn) {
      throw new NotLoggedInError();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Resolve account URL — required by Robinhood for all order submissions. */
  private async resolveAccountUrl(accountNumber?: string): Promise<string> {
    if (accountNumber) return urls.account(accountNumber);
    const accounts = await this.getAccounts();
    if (accounts.length === 0) throw new NotFoundError("No brokerage account found");
    return (accounts[0] as Account).url;
  }

  // ---------------------------------------------------------------------------
  // Accounts & Profiles
  // ---------------------------------------------------------------------------

  async getAccounts(opts?: { allAccounts?: boolean }): Promise<Account[]> {
    this.requireAuth();
    const params = opts?.allAccounts !== false ? { ...MULTI_ACCOUNT_PARAMS } : {};
    return (await requestGet(this._session, urls.accounts(), {
      dataType: "results",
      params,
    })) as Account[];
  }

  async getAccountProfile(accountNumber?: string): Promise<Account> {
    this.requireAuth();
    if (accountNumber) {
      return (await requestGet(this._session, urls.account(accountNumber))) as Account;
    }
    const accounts = await this.getAccounts();
    if (accounts.length === 0) throw new NotFoundError("No brokerage account found");
    return accounts[0] as Account;
  }

  async getPortfolioProfile(accountNumber?: string): Promise<Portfolio> {
    this.requireAuth();
    if (accountNumber) {
      return (await requestGet(this._session, urls.portfolio(accountNumber))) as Portfolio;
    }
    return (await requestGet(this._session, urls.portfolios(), {
      dataType: "indexzero",
    })) as Portfolio;
  }

  async getUserProfile(): Promise<UserProfile> {
    this.requireAuth();
    return (await requestGet(this._session, urls.user())) as UserProfile;
  }

  async getInvestmentProfile(): Promise<InvestmentProfile> {
    this.requireAuth();
    return (await requestGet(this._session, urls.investmentProfile())) as InvestmentProfile;
  }

  // ---------------------------------------------------------------------------
  // Positions & Holdings
  // ---------------------------------------------------------------------------

  async getPositions(opts?: { accountNumber?: string; nonzero?: boolean }): Promise<Position[]> {
    this.requireAuth();
    const params: Record<string, string> = { ...MULTI_ACCOUNT_PARAMS };
    if (opts?.nonzero) params.nonzero = "true";
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this._session, urls.positions(), {
      dataType: "pagination",
      params,
    })) as Position[];
  }

  async getInstrumentByUrl(url: string): Promise<Instrument> {
    this.requireAuth();
    if (!url.startsWith(urls.API_BASE)) {
      throw new Error(`Refusing to fetch instrument from untrusted URL: ${url}`);
    }
    return (await requestGet(this._session, url)) as Instrument;
  }

  async buildHoldings(opts?: {
    accountNumber?: string;
    withDividends?: boolean;
  }): Promise<Record<string, Holding>> {
    this.requireAuth();
    const positions = await this.getPositions({
      accountNumber: opts?.accountNumber,
      nonzero: true,
    });

    if (positions.length === 0) return {};

    // Resolve all instruments concurrently
    const instruments = await Promise.all(
      positions.map((pos) => this.getInstrumentByUrl(pos.instrument)),
    );

    const symbolList = instruments.map((i) => i.symbol);
    const quotes = await this.getQuotes(symbolList);

    const dividendMap: Record<string, string | null> = {};
    if (opts?.withDividends) {
      const fundies = await this.getFundamentals(symbolList);
      for (const f of fundies) {
        if (f.symbol) {
          dividendMap[f.symbol] = f.dividend_yield ?? null;
        }
      }
    }

    const holdings: Record<string, Holding> = {};
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i] as Position;
      const inst = instruments[i] as Instrument;
      const quote = quotes.find((q) => q.symbol === inst.symbol);

      const quantity = parseFloat(pos.quantity);
      const avgCost = parseFloat(pos.average_buy_price);
      const price = parseFloat(quote?.last_trade_price ?? "0");
      const equity = quantity * price;
      const equityChange = equity - quantity * avgCost;
      const percentChange = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

      const holding: Holding = {
        symbol: inst.symbol,
        name: inst.simple_name ?? inst.name,
        quantity: String(quantity),
        average_buy_price: String(avgCost),
        price: String(price),
        equity: String(equity),
        equity_change: String(equityChange),
        percent_change: String(percentChange),
        pe_ratio: quote?.pe_ratio ?? null,
      };

      if (opts?.withDividends) {
        holding.dividend_rate = dividendMap[inst.symbol] ?? null;
      }

      holdings[inst.symbol] = holding;
    }

    return holdings;
  }

  // ---------------------------------------------------------------------------
  // Quotes & Fundamentals
  // ---------------------------------------------------------------------------

  async getQuotes(symbols: string | string[]): Promise<Quote[]> {
    this.requireAuth();
    const list = normalizeSymbols(symbols);
    return (await requestGet(this._session, urls.quotes(), {
      dataType: "results",
      params: { symbols: list.join(",") },
    })) as Quote[];
  }

  async getLatestPrice(symbols: string[], opts?: { priceType?: string }): Promise<string[]> {
    this.requireAuth();
    const quotes = await this.getQuotes(symbols);
    const field = opts?.priceType ?? "last_trade_price";
    return quotes.map((q) => {
      const value = (q as unknown as Record<string, unknown>)[field];
      return String(value ?? q.last_trade_price ?? "0");
    });
  }

  async getFundamentals(symbols: string[]): Promise<Fundamental[]> {
    this.requireAuth();
    const list = symbols.map((s) => s.trim().toUpperCase());
    return (await requestGet(this._session, urls.fundamentals(), {
      dataType: "results",
      params: { symbols: list.join(",") },
    })) as Fundamental[];
  }

  async getStockHistoricals(
    symbols: string | string[],
    opts?: { interval?: string; span?: string; bounds?: string },
  ): Promise<StockHistorical[]> {
    this.requireAuth();
    const list = normalizeSymbols(symbols);
    return (await requestGet(this._session, urls.stockHistoricals(), {
      dataType: "results",
      params: {
        symbols: list.join(","),
        interval: opts?.interval ?? "day",
        span: opts?.span ?? "month",
        bounds: opts?.bounds ?? "regular",
      },
    })) as StockHistorical[];
  }

  // ---------------------------------------------------------------------------
  // News, Ratings, Earnings
  // ---------------------------------------------------------------------------

  async getNews(symbol: string): Promise<News[]> {
    this.requireAuth();
    return (await requestGet(this._session, urls.news(symbol), {
      dataType: "results",
    })) as News[];
  }

  async getRatings(symbol: string): Promise<Rating> {
    this.requireAuth();
    // Ratings endpoint uses the instrument ID
    const insts = await this.findInstruments(symbol);
    if (insts.length === 0) return {} as Rating;
    const inst = insts[0] as Instrument;
    return (await requestGet(this._session, urls.ratings(inst.id))) as Rating;
  }

  async getEarnings(symbol: string): Promise<Earnings[]> {
    this.requireAuth();
    // Use the instrument_id approach to get earnings
    const insts = await this.findInstruments(symbol);
    if (insts.length === 0) return [];
    return (await requestGet(this._session, urls.earnings(), {
      dataType: "results",
      params: { symbol: symbol.toUpperCase() },
    })) as Earnings[];
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  private async getIndexes(): Promise<Map<string, IndexInstrument>> {
    if (this._indexCache) return this._indexCache;
    this.requireAuth();
    const indexes = (await requestGet(this._session, urls.indexes(), {
      dataType: "results",
    })) as IndexInstrument[];
    this._indexCache = new Map();
    for (const idx of indexes) {
      this._indexCache.set(idx.symbol.toUpperCase(), idx);
    }
    return this._indexCache;
  }

  async getIndexValue(symbol: string): Promise<IndexValue | null> {
    this.requireAuth();
    const indexMap = await this.getIndexes();
    const index = indexMap.get(symbol.toUpperCase());
    if (!index) return null;
    const resp = (await requestGet(this._session, urls.indexValues(), {
      params: { ids: index.id },
    })) as { status?: string; data?: Array<{ status?: string; data?: IndexValue }> };
    return resp.data?.[0]?.data ?? null;
  }

  // ---------------------------------------------------------------------------
  // Options
  // ---------------------------------------------------------------------------

  async getChains(symbol: string, opts?: { expirationDate?: string }): Promise<OptionChain> {
    this.requireAuth();
    const sym = symbol.toUpperCase();
    const emptyChain = { id: "", expiration_dates: [] } as unknown as OptionChain;

    // Check if this is an index symbol (SPX, NDX, VIX, RUT, XSP, etc.)
    const indexMap = await this.getIndexes();
    const index = indexMap.get(sym);
    if (index?.tradable_chain_ids?.length) {
      const chains = (await requestGet(this._session, urls.optionChains(), {
        dataType: "results",
        params: { ids: index.tradable_chain_ids.join(",") },
      })) as OptionChain[];

      if (chains.length === 0) return emptyChain;
      if (chains.length === 1) return chains[0] ?? emptyChain;

      // Multiple chains (e.g. SPXW weeklies + SPX monthlies).
      // Pick the chain that contains the requested expiration date.
      const expDate = opts?.expirationDate;
      if (expDate) {
        const matching = chains.filter((c) => c.expiration_dates.includes(expDate));
        if (matching.length > 0) return matching[0] ?? emptyChain;
      }

      // Default: return the chain with the most expiration dates (weeklies/dailies)
      chains.sort((a, b) => b.expiration_dates.length - a.expiration_dates.length);
      return chains[0] ?? emptyChain;
    }

    // Equity path — resolve instrument ID for correct chain lookup
    const instruments = await this.findInstruments(sym);
    const inst = instruments.find((i) => i.symbol === sym);
    if (!inst) return emptyChain;
    const chains = (await requestGet(this._session, urls.optionChains(), {
      dataType: "results",
      params: { equity_instrument_ids: inst.id, state: "active" },
    })) as OptionChain[];
    return chains[0] ?? emptyChain;
  }

  async findTradableOptions(
    symbol: string,
    opts?: { expirationDate?: string; strikePrice?: number; optionType?: string },
  ): Promise<OptionInstrument[]> {
    this.requireAuth();
    const chain = await this.getChains(symbol, {
      expirationDate: opts?.expirationDate,
    });
    const params: Record<string, string> = {
      chain_id: chain.id,
    };
    if (opts?.expirationDate) params.expiration_dates = opts.expirationDate;
    if (opts?.strikePrice != null) params.strike_price = String(opts.strikePrice);
    if (opts?.optionType) params.type = opts.optionType;

    let results = (await requestGet(this._session, urls.optionInstruments(), {
      dataType: "pagination",
      params,
    })) as OptionInstrument[];

    // Client-side filtering — the API doesn't always honor query params
    if (opts?.expirationDate) {
      results = results.filter((o) => o.expiration_date === opts.expirationDate);
    }
    if (opts?.strikePrice != null) {
      const target = String(opts.strikePrice);
      results = results.filter((o) => Number(o.strike_price) === Number(target));
    }
    if (opts?.optionType) {
      results = results.filter((o) => o.type === opts.optionType);
    }

    return results;
  }

  async getOptionMarketData(
    symbol: string,
    expirationDate: string,
    strikePrice: number,
    optionType: string,
  ): Promise<OptionMarketData[]> {
    this.requireAuth();
    const options = await this.findTradableOptions(symbol, {
      expirationDate,
      strikePrice,
      optionType,
    });
    if (options.length === 0) return [];

    return Promise.all(
      options.map(
        (opt) =>
          requestGet(this._session, urls.optionMarketData(opt.id)) as Promise<OptionMarketData>,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Crypto
  // ---------------------------------------------------------------------------

  async getCryptoQuote(symbol: string): Promise<CryptoQuote> {
    this.requireAuth();
    const pairs = (await requestGet(this._session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === symbol.toUpperCase());
    if (!pair) {
      return { mark_price: "0" } as CryptoQuote;
    }
    return (await requestGet(this._session, urls.cryptoQuote(pair.id))) as CryptoQuote;
  }

  async getCryptoHistoricals(
    symbol: string,
    opts?: { interval?: string; span?: string; bounds?: string },
  ): Promise<HistoricalDataPoint[]> {
    this.requireAuth();
    const pairs = (await requestGet(this._session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === symbol.toUpperCase());
    if (!pair) return [];
    return (await requestGet(this._session, urls.cryptoHistoricals(pair.id), {
      dataType: "results",
      params: {
        interval: opts?.interval ?? "day",
        span: opts?.span ?? "month",
        bounds: opts?.bounds ?? "24_7",
      },
    })) as HistoricalDataPoint[];
  }

  async getCryptoPositions(): Promise<CryptoPosition[]> {
    this.requireAuth();
    return (await requestGet(this._session, urls.cryptoHoldings(), {
      dataType: "results",
    })) as CryptoPosition[];
  }

  // ---------------------------------------------------------------------------
  // Stock Orders
  // ---------------------------------------------------------------------------

  async getAllStockOrders(opts?: { accountNumber?: string }): Promise<StockOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this._session, urls.stockOrders(), {
      dataType: "pagination",
      params,
    })) as StockOrder[];
  }

  async getOpenStockOrders(opts?: { accountNumber?: string }): Promise<StockOrder[]> {
    const all = await this.getAllStockOrders(opts);
    return all.filter((o) => o.cancel != null);
  }

  async getStockOrder(orderId: string): Promise<StockOrder> {
    this.requireAuth();
    return (await requestGet(this._session, urls.stockOrder(orderId))) as StockOrder;
  }

  async orderStock(
    symbol: string,
    side: "buy" | "sell",
    quantity: number,
    opts?: {
      limitPrice?: number;
      stopPrice?: number;
      trailAmount?: number;
      trailType?: "percentage" | "amount";
      timeInForce?: string;
      extendedHours?: boolean;
      accountNumber?: string;
    },
  ): Promise<StockOrder> {
    this.requireAuth();
    const sym = symbol.trim().toUpperCase();

    // Validate mutually exclusive order params
    if (opts?.trailAmount != null && (opts?.limitPrice != null || opts?.stopPrice != null)) {
      throw new Error("Cannot combine trailAmount with limitPrice or stopPrice");
    }

    // Fractional orders must be market orders with gfd
    const isFractional = !Number.isInteger(quantity);
    if (isFractional) {
      if (opts?.limitPrice != null || opts?.stopPrice != null || opts?.trailAmount != null) {
        throw new Error(
          "Fractional orders must be market orders (no limit, stop, or trailing stop)",
        );
      }
    }

    // Find the instrument URL
    const insts = await this.findInstruments(sym);
    if (insts.length === 0) throw new NotFoundError(`Instrument not found: ${sym}`);
    const inst = insts[0] as Instrument;

    // Determine order type and trigger from price params
    let orderType: string;
    let trigger: string;

    if (opts?.trailAmount != null) {
      orderType = "market";
      trigger = "stop";
    } else if (opts?.stopPrice != null && opts?.limitPrice != null) {
      orderType = "limit";
      trigger = "stop";
    } else if (opts?.stopPrice != null) {
      orderType = "market";
      trigger = "stop";
    } else if (opts?.limitPrice != null) {
      orderType = "limit";
      trigger = "immediate";
    } else {
      orderType = "market";
      trigger = "immediate";
    }

    const accountUrl = await this.resolveAccountUrl(opts?.accountNumber);

    const payload: Record<string, unknown> = {
      account: accountUrl,
      instrument: inst.url,
      symbol: sym,
      side,
      quantity: String(quantity),
      type: orderType,
      trigger,
      time_in_force: isFractional ? "gfd" : (opts?.timeInForce ?? "gtc"),
      extended_hours: opts?.extendedHours ?? false,
      ref_id: crypto.randomUUID(),
    };

    if (opts?.limitPrice != null) payload.price = String(opts.limitPrice);
    if (opts?.stopPrice != null) payload.stop_price = String(opts.stopPrice);
    if (opts?.trailAmount != null) {
      payload.trailing_peg = {
        type: opts.trailType ?? "percentage",
        percentage: opts.trailType === "amount" ? undefined : String(opts.trailAmount),
        price: opts.trailType === "amount" ? { amount: String(opts.trailAmount) } : undefined,
      };
    }

    // Market buys get a 5% price collar
    if (orderType === "market" && side === "buy" && trigger === "immediate") {
      payload.preset_percent_limit = "0.05";
    }

    return (await requestPost(this._session, urls.stockOrders(), {
      payload,
      asJson: true,
    })) as StockOrder;
  }

  async cancelStockOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this._session, urls.cancelStockOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Option Orders
  // ---------------------------------------------------------------------------

  async getAllOptionOrders(opts?: { accountNumber?: string }): Promise<OptionOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this._session, urls.optionOrders(), {
      dataType: "pagination",
      params,
    })) as OptionOrder[];
  }

  async getOpenOptionOrders(opts?: { accountNumber?: string }): Promise<OptionOrder[]> {
    const all = await this.getAllOptionOrders(opts);
    return all.filter((o) => o.cancel_url != null);
  }

  async getOptionOrder(orderId: string): Promise<OptionOrder> {
    this.requireAuth();
    return (await requestGet(this._session, urls.optionOrder(orderId))) as OptionOrder;
  }

  async orderOption(
    symbol: string,
    legs: Array<{
      expirationDate: string;
      strike: number;
      optionType: "call" | "put";
      side: "buy" | "sell";
      positionEffect: "open" | "close";
      ratioQuantity?: number;
    }>,
    price: number,
    quantity: number,
    direction: "debit" | "credit",
    opts?: {
      stopPrice?: number;
      timeInForce?: string;
      accountNumber?: string;
    },
  ): Promise<OptionOrder> {
    this.requireAuth();
    if (legs.length === 0) {
      throw new Error("At least one leg is required");
    }

    // Resolve each leg's option instrument
    const resolvedLegs = [];
    for (const leg of legs) {
      const options = await this.findTradableOptions(symbol, {
        expirationDate: leg.expirationDate,
        strikePrice: leg.strike,
        optionType: leg.optionType,
      });
      if (options.length === 0) {
        throw new NotFoundError(
          `No tradable option found: ${symbol} ${leg.expirationDate} ${leg.strike} ${leg.optionType}`,
        );
      }
      const opt = options[0] as OptionInstrument;
      resolvedLegs.push({
        option_id: opt.id,
        side: leg.side,
        position_effect: leg.positionEffect,
        ratio_quantity: leg.ratioQuantity ?? 1,
      });
    }

    const accountUrl = await this.resolveAccountUrl(opts?.accountNumber);

    const payload: Record<string, unknown> = {
      account: accountUrl,
      direction,
      legs: resolvedLegs,
      price: String(price),
      quantity: String(quantity),
      type: "limit",
      time_in_force: opts?.timeInForce ?? "gfd",
      trigger: opts?.stopPrice != null ? "stop" : "immediate",
      market_hours: "regular_hours",
      override_day_trade_checks: true,
      override_dtbp_checks: true,
      ref_id: crypto.randomUUID(),
    };

    if (opts?.stopPrice != null) {
      payload.stop_price = String(opts.stopPrice);
    }

    return (await requestPost(this._session, urls.optionOrders(), {
      payload,
      asJson: true,
    })) as OptionOrder;
  }

  async cancelOptionOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this._session, urls.cancelOptionOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Crypto Orders
  // ---------------------------------------------------------------------------

  async getAllCryptoOrders(opts?: { accountNumber?: string }): Promise<CryptoOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this._session, urls.cryptoOrders(), {
      dataType: "pagination",
      params,
    })) as CryptoOrder[];
  }

  async getOpenCryptoOrders(opts?: { accountNumber?: string }): Promise<CryptoOrder[]> {
    const all = await this.getAllCryptoOrders(opts);
    return all.filter((o) => o.state === "unconfirmed" || o.state === "confirmed");
  }

  async getCryptoOrder(orderId: string): Promise<CryptoOrder> {
    this.requireAuth();
    return (await requestGet(this._session, urls.cryptoOrder(orderId))) as CryptoOrder;
  }

  async orderCrypto(
    symbol: string,
    side: "buy" | "sell",
    amountOrQuantity: number,
    opts?: {
      amountIn?: "quantity" | "price";
      orderType?: "market" | "limit";
      limitPrice?: number;
    },
  ): Promise<CryptoOrder> {
    this.requireAuth();
    const s = symbol.trim().toUpperCase();

    // Look up the currency pair
    const pairs = (await requestGet(this._session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === s);
    if (!pair) throw new NotFoundError(`Crypto pair not found: ${s}`);

    // Determine if specifying quantity or dollar amount
    const amountIn = opts?.amountIn ?? "quantity";
    const payload: Record<string, unknown> = {
      currency_pair_id: pair.id,
      side,
      type: opts?.orderType ?? "market",
      time_in_force: "gtc",
      ref_id: crypto.randomUUID(),
    };

    if (amountIn === "quantity") {
      payload.quantity = String(amountOrQuantity);
    } else {
      // Dollar amount — Robinhood expects quantity, so we calculate it from the dollar amount
      if (opts?.limitPrice != null) {
        // Use limitPrice to derive quantity from dollar amount
        payload.quantity = String(amountOrQuantity / opts.limitPrice);
      } else {
        payload.price = String(amountOrQuantity);
      }
    }

    if (opts?.limitPrice != null) {
      payload.price = String(opts.limitPrice);
      payload.type = "limit";
    }

    return (await requestPost(this._session, urls.cryptoOrders(), {
      payload,
      asJson: true,
    })) as CryptoOrder;
  }

  async cancelCryptoOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this._session, urls.cancelCryptoOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Markets & Search
  // ---------------------------------------------------------------------------

  async getTopMovers(): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this._session, urls.topMovers())) as {
      instruments: string[];
    };
    return Promise.all((data.instruments ?? []).map((url) => this.getInstrumentByUrl(url)));
  }

  async getTopMoversSp500(direction: "up" | "down"): Promise<Instrument[]> {
    this.requireAuth();
    return (await requestGet(this._session, urls.topMoversSp500(), {
      dataType: "results",
      params: { direction },
    })) as Instrument[];
  }

  async getTop100(): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this._session, urls.top100())) as {
      instruments: string[];
    };
    return Promise.all((data.instruments ?? []).map((url) => this.getInstrumentByUrl(url)));
  }

  async findInstruments(query: string): Promise<Instrument[]> {
    this.requireAuth();
    return (await requestGet(this._session, urls.instruments(), {
      dataType: "results",
      params: { query: query.trim() },
    })) as Instrument[];
  }

  async getAllStocksFromMarketTag(tag: string): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this._session, urls.tags(tag))) as {
      instruments: string[];
    };
    return Promise.all((data.instruments ?? []).map((url) => this.getInstrumentByUrl(url)));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSymbols(symbols: string | string[]): string[] {
  if (typeof symbols === "string") {
    return symbols
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return symbols.map((s) => s.trim().toUpperCase());
}
