/**
 * URL builders for Robinhood API endpoints.
 * All functions are pure — no state, no side effects.
 */

export const API_BASE = "https://api.robinhood.com";
export const NUMMUS_BASE = "https://nummus.robinhood.com";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function oauthToken(): string {
  return `${API_BASE}/oauth2/token/`;
}

export function oauthRevoke(): string {
  return `${API_BASE}/oauth2/revoke_token/`;
}

export function challenge(challengeId: string): string {
  return `${API_BASE}/challenge/${challengeId}/respond/`;
}

export function pathfinderUserMachine(): string {
  return `${API_BASE}/pathfinder/user_machine/`;
}

export function pathfinderInquiry(machineId: string): string {
  return `${API_BASE}/pathfinder/inquiries/${machineId}/user_view/`;
}

export function pushPromptStatus(challengeId: string): string {
  return `${API_BASE}/push/${challengeId}/get_prompts_status/`;
}

// ---------------------------------------------------------------------------
// Accounts & Profiles
// ---------------------------------------------------------------------------

export function accounts(): string {
  return `${API_BASE}/accounts/`;
}

export function account(accountNumber: string): string {
  return `${API_BASE}/accounts/${accountNumber}/`;
}

export function portfolios(): string {
  return `${API_BASE}/portfolios/`;
}

export function portfolio(accountNumber: string): string {
  return `${API_BASE}/portfolios/${accountNumber}/`;
}

export function portfolioHistoricals(accountNumber: string): string {
  return `${API_BASE}/portfolios/historicals/${accountNumber}/`;
}

export function user(): string {
  return `${API_BASE}/user/`;
}

export function userBasicInfo(): string {
  return `${API_BASE}/user/basic_info/`;
}

export function investmentProfile(): string {
  return `${API_BASE}/user/investment_profile/`;
}

export function dividends(): string {
  return `${API_BASE}/dividends/`;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export function positions(): string {
  return `${API_BASE}/positions/`;
}

// ---------------------------------------------------------------------------
// Stocks
// ---------------------------------------------------------------------------

export function quotes(): string {
  return `${API_BASE}/quotes/`;
}

export function quote(symbol: string): string {
  return `${API_BASE}/quotes/${symbol.toUpperCase()}/`;
}

export function instruments(): string {
  return `${API_BASE}/instruments/`;
}

export function instrument(instrumentId: string): string {
  return `${API_BASE}/instruments/${instrumentId}/`;
}

export function fundamentals(): string {
  return `${API_BASE}/fundamentals/`;
}

export function fundamental(symbol: string): string {
  return `${API_BASE}/fundamentals/${symbol.toUpperCase()}/`;
}

export function stockHistoricals(): string {
  return `${API_BASE}/quotes/historicals/`;
}

export function stockHistoricalsFor(symbol: string): string {
  return `${API_BASE}/quotes/historicals/${symbol.toUpperCase()}/`;
}

export function news(symbol: string): string {
  return `${API_BASE}/midlands/news/${symbol.toUpperCase()}/`;
}

export function ratings(instrumentId: string): string {
  return `${API_BASE}/midlands/ratings/${instrumentId}/`;
}

export function earnings(): string {
  return `${API_BASE}/marketdata/earnings/`;
}

export function tags(tag: string): string {
  return `${API_BASE}/midlands/tags/tag/${tag}/`;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function optionChains(): string {
  return `${API_BASE}/options/chains/`;
}

export function optionChain(chainId: string): string {
  return `${API_BASE}/options/chains/${chainId}/`;
}

export function optionInstruments(): string {
  return `${API_BASE}/options/instruments/`;
}

export function optionMarketData(optionId: string): string {
  return `${API_BASE}/marketdata/options/${optionId}/`;
}

export function optionOrders(): string {
  return `${API_BASE}/options/orders/`;
}

export function optionOrder(orderId: string): string {
  return `${API_BASE}/options/orders/${orderId}/`;
}

export function optionPositions(): string {
  return `${API_BASE}/options/positions/`;
}

export function optionAggregatePositions(): string {
  return `${API_BASE}/options/aggregate_positions/`;
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

export function cryptoCurrencyPairs(): string {
  return `${NUMMUS_BASE}/currency_pairs/`;
}

export function cryptoQuote(pairId: string): string {
  return `${API_BASE}/marketdata/forex/quotes/${pairId}/`;
}

export function cryptoHistoricals(pairId: string): string {
  return `${API_BASE}/marketdata/forex/historicals/${pairId}/`;
}

export function cryptoHoldings(): string {
  return `${NUMMUS_BASE}/holdings/`;
}

export function cryptoOrders(): string {
  return `${NUMMUS_BASE}/orders/`;
}

export function cryptoOrder(orderId: string): string {
  return `${NUMMUS_BASE}/orders/${orderId}/`;
}

export function cryptoAccounts(): string {
  return `${NUMMUS_BASE}/accounts/`;
}

// ---------------------------------------------------------------------------
// Stock Orders
// ---------------------------------------------------------------------------

export function stockOrders(): string {
  return `${API_BASE}/orders/`;
}

export function stockOrder(orderId: string): string {
  return `${API_BASE}/orders/${orderId}/`;
}

export function cancelStockOrder(orderId: string): string {
  return `${API_BASE}/orders/${orderId}/cancel/`;
}

export function cancelOptionOrder(orderId: string): string {
  return `${API_BASE}/options/orders/${orderId}/cancel/`;
}

export function cancelCryptoOrder(orderId: string): string {
  return `${NUMMUS_BASE}/orders/${orderId}/cancel/`;
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export function markets(): string {
  return `${API_BASE}/markets/`;
}

export function marketHours(market: string, date: string): string {
  return `${API_BASE}/markets/${market}/hours/${date}/`;
}

export function topMoversSp500(): string {
  return `${API_BASE}/midlands/movers/sp500/`;
}

export function topMovers(): string {
  return `${API_BASE}/midlands/tags/tag/top-movers/`;
}

export function top100(): string {
  return `${API_BASE}/midlands/tags/tag/100-most-popular/`;
}
