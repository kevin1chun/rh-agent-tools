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
  private session: RobinhoodSession;
  private _loggedIn = false;

  constructor(opts?: { timeoutMs?: number }) {
    this.session = createSession(opts);
  }

  get isLoggedIn(): boolean {
    return this._loggedIn;
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async restoreSession(): Promise<LoginResult> {
    const result = await restoreSessionFn(this.session);
    this._loggedIn = true;
    return result;
  }

  async logout(): Promise<void> {
    await logoutFn(this.session);
    this._loggedIn = false;
  }

  private requireAuth(): void {
    if (!this._loggedIn) {
      throw new NotLoggedInError();
    }
  }

  // ---------------------------------------------------------------------------
  // Accounts & Profiles
  // ---------------------------------------------------------------------------

  async getAccounts(opts?: { allAccounts?: boolean }): Promise<Account[]> {
    this.requireAuth();
    const params = opts?.allAccounts !== false ? { ...MULTI_ACCOUNT_PARAMS } : {};
    return (await requestGet(this.session, urls.accounts(), {
      dataType: "results",
      params,
    })) as Account[];
  }

  async getAccountProfile(accountNumber?: string): Promise<Account> {
    this.requireAuth();
    if (accountNumber) {
      return (await requestGet(this.session, urls.account(accountNumber))) as Account;
    }
    const accounts = await this.getAccounts();
    return accounts[0] as Account;
  }

  async getPortfolioProfile(accountNumber?: string): Promise<Portfolio> {
    this.requireAuth();
    if (accountNumber) {
      return (await requestGet(this.session, urls.portfolio(accountNumber))) as Portfolio;
    }
    return (await requestGet(this.session, urls.portfolios(), {
      dataType: "indexzero",
    })) as Portfolio;
  }

  async getUserProfile(): Promise<UserProfile> {
    this.requireAuth();
    return (await requestGet(this.session, urls.user())) as UserProfile;
  }

  async getInvestmentProfile(): Promise<InvestmentProfile> {
    this.requireAuth();
    return (await requestGet(this.session, urls.investmentProfile())) as InvestmentProfile;
  }

  // ---------------------------------------------------------------------------
  // Positions & Holdings
  // ---------------------------------------------------------------------------

  async getPositions(opts?: { accountNumber?: string; nonzero?: boolean }): Promise<Position[]> {
    this.requireAuth();
    const params: Record<string, string> = { ...MULTI_ACCOUNT_PARAMS };
    if (opts?.nonzero) params.nonzero = "true";
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.positions(), {
      dataType: "pagination",
      params,
    })) as Position[];
  }

  async getInstrumentByUrl(url: string): Promise<Instrument> {
    this.requireAuth();
    return (await requestGet(this.session, url)) as Instrument;
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

    // Resolve instruments and quotes in parallel per position
    const instruments: Instrument[] = [];
    for (const pos of positions) {
      const inst = await this.getInstrumentByUrl(pos.instrument);
      instruments.push(inst);
    }

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
    return (await requestGet(this.session, urls.quotes(), {
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
    return (await requestGet(this.session, urls.fundamentals(), {
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
    return (await requestGet(this.session, urls.stockHistoricals(), {
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
    return (await requestGet(this.session, urls.news(symbol), {
      dataType: "results",
    })) as News[];
  }

  async getRatings(symbol: string): Promise<Rating> {
    this.requireAuth();
    // Ratings endpoint uses the instrument ID
    const insts = await this.findInstruments(symbol);
    if (insts.length === 0) return {} as Rating;
    const inst = insts[0] as Instrument;
    return (await requestGet(this.session, urls.ratings(inst.id))) as Rating;
  }

  async getEarnings(symbol: string): Promise<Earnings[]> {
    this.requireAuth();
    // Use the instrument_id approach to get earnings
    const insts = await this.findInstruments(symbol);
    if (insts.length === 0) return [];
    return (await requestGet(this.session, urls.earnings(), {
      dataType: "results",
      params: { symbol: symbol.toUpperCase() },
    })) as Earnings[];
  }

  // ---------------------------------------------------------------------------
  // Options
  // ---------------------------------------------------------------------------

  async getChains(symbol: string): Promise<OptionChain> {
    this.requireAuth();
    const chains = (await requestGet(this.session, urls.optionChains(), {
      dataType: "results",
      params: { equity_instrument_ids: "", state: "active", symbol: symbol.toUpperCase() },
    })) as OptionChain[];
    return chains[0] ?? ({ id: "", expiration_dates: [] } as unknown as OptionChain);
  }

  async findTradableOptions(
    symbol: string,
    opts?: { expirationDate?: string; strikePrice?: number; optionType?: string },
  ): Promise<OptionInstrument[]> {
    this.requireAuth();
    const chain = await this.getChains(symbol);
    const params: Record<string, string> = {
      chain_id: chain.id,
      state: "active",
      tradability: "tradable",
    };
    if (opts?.expirationDate) params.expiration_date = opts.expirationDate;
    if (opts?.strikePrice != null) params.strike_price = String(opts.strikePrice);
    if (opts?.optionType) params.type = opts.optionType;

    return (await requestGet(this.session, urls.optionInstruments(), {
      dataType: "pagination",
      params,
    })) as OptionInstrument[];
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

    const results: OptionMarketData[] = [];
    for (const opt of options) {
      const data = (await requestGet(
        this.session,
        urls.optionMarketData(opt.id),
      )) as OptionMarketData;
      results.push(data);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Crypto
  // ---------------------------------------------------------------------------

  async getCryptoQuote(symbol: string): Promise<CryptoQuote> {
    this.requireAuth();
    const pairs = (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === symbol.toUpperCase());
    if (!pair) {
      return { mark_price: "0" } as CryptoQuote;
    }
    return (await requestGet(this.session, urls.cryptoQuote(pair.id))) as CryptoQuote;
  }

  async getCryptoHistoricals(
    symbol: string,
    opts?: { interval?: string; span?: string; bounds?: string },
  ): Promise<HistoricalDataPoint[]> {
    this.requireAuth();
    const pairs = (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === symbol.toUpperCase());
    if (!pair) return [];
    return (await requestGet(this.session, urls.cryptoHistoricals(pair.id), {
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
    return (await requestGet(this.session, urls.cryptoHoldings(), {
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
    return (await requestGet(this.session, urls.stockOrders(), {
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
    return (await requestGet(this.session, urls.stockOrder(orderId))) as StockOrder;
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

    // Resolve account URL from explicit param or first account
    let accountUrl: string;
    if (opts?.accountNumber) {
      accountUrl = urls.account(opts.accountNumber);
    } else {
      const accounts = await this.getAccounts();
      if (accounts.length === 0) throw new NotFoundError("No brokerage account found");
      accountUrl = (accounts[0] as Account).url;
    }

    const payload: Record<string, unknown> = {
      account: accountUrl,
      instrument: inst.url,
      symbol: sym,
      side,
      quantity: String(quantity),
      type: orderType,
      trigger,
      time_in_force: opts?.timeInForce ?? "gtc",
      extended_hours: opts?.extendedHours ?? false,
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

    return (await requestPost(this.session, urls.stockOrders(), {
      payload,
      asJson: true,
    })) as StockOrder;
  }

  async cancelStockOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this.session, urls.cancelStockOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Option Orders
  // ---------------------------------------------------------------------------

  async getAllOptionOrders(opts?: { accountNumber?: string }): Promise<OptionOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.optionOrders(), {
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
    return (await requestGet(this.session, urls.optionOrder(orderId))) as OptionOrder;
  }

  async orderOption(
    symbol: string,
    expirationDate: string,
    strike: number,
    optionType: "call" | "put",
    side: "buy" | "sell",
    positionEffect: "open" | "close",
    quantity: number,
    price: number,
    opts?: {
      direction?: "debit" | "credit";
      timeInForce?: string;
      accountNumber?: string;
    },
  ): Promise<OptionOrder> {
    this.requireAuth();
    const options = await this.findTradableOptions(symbol, {
      expirationDate,
      strikePrice: strike,
      optionType,
    });
    if (options.length === 0) {
      throw new NotFoundError(
        `No tradable option found: ${symbol} ${expirationDate} ${strike} ${optionType}`,
      );
    }
    const opt = options[0] as OptionInstrument;

    const payload: Record<string, unknown> = {
      direction: opts?.direction ?? (side === "buy" ? "debit" : "credit"),
      legs: [
        {
          option: opt.url,
          side,
          position_effect: positionEffect,
          ratio_quantity: 1,
        },
      ],
      price: String(price),
      quantity: String(quantity),
      type: "limit",
      time_in_force: opts?.timeInForce ?? "gtc",
      trigger: "immediate",
    };

    return (await requestPost(this.session, urls.optionOrders(), {
      payload,
      asJson: true,
    })) as OptionOrder;
  }

  async cancelOptionOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this.session, urls.cancelOptionOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Crypto Orders
  // ---------------------------------------------------------------------------

  async getAllCryptoOrders(opts?: { accountNumber?: string }): Promise<CryptoOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.cryptoOrders(), {
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
    return (await requestGet(this.session, urls.cryptoOrder(orderId))) as CryptoOrder;
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
    const pairs = (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
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
    };

    if (amountIn === "quantity") {
      payload.quantity = String(amountOrQuantity);
    } else {
      // Dollar amount
      payload.price = String(amountOrQuantity);
    }

    if (opts?.limitPrice != null) {
      payload.price = String(opts.limitPrice);
      payload.type = "limit";
    }

    return (await requestPost(this.session, urls.cryptoOrders(), {
      payload,
      asJson: true,
    })) as CryptoOrder;
  }

  async cancelCryptoOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this.session, urls.cancelCryptoOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Markets & Search
  // ---------------------------------------------------------------------------

  async getTopMovers(): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.topMovers())) as {
      instruments: string[];
    };
    const results: Instrument[] = [];
    for (const url of data.instruments ?? []) {
      results.push(await this.getInstrumentByUrl(url));
    }
    return results;
  }

  async getTopMoversSp500(direction: "up" | "down"): Promise<Instrument[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.topMoversSp500(), {
      dataType: "results",
      params: { direction },
    })) as Instrument[];
  }

  async getTop100(): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.top100())) as {
      instruments: string[];
    };
    const results: Instrument[] = [];
    for (const url of data.instruments ?? []) {
      results.push(await this.getInstrumentByUrl(url));
    }
    return results;
  }

  async findInstruments(query: string): Promise<Instrument[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.instruments(), {
      dataType: "results",
      params: { query: query.trim() },
    })) as Instrument[];
  }

  async getAllStocksFromMarketTag(tag: string): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.tags(tag))) as {
      instruments: string[];
    };
    const results: Instrument[] = [];
    for (const url of data.instruments ?? []) {
      results.push(await this.getInstrumentByUrl(url));
    }
    return results;
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
