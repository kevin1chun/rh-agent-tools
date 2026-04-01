/** Shared test fixtures and sample data. */

export const SAMPLE_ACCOUNT = {
  url: "https://api.robinhood.com/accounts/ABC12345/",
  account_number: "ABC12345",
  type: "individual",
  cash: "1000.00",
  buying_power: "2000.00",
  crypto_buying_power: "500.00",
  cash_available_for_withdrawal: "1000.00",
};

export const SAMPLE_PORTFOLIO = {
  equity: "15000.00",
  market_value: "14000.00",
  excess_margin: "1000.00",
};

export const SAMPLE_QUOTE = {
  symbol: "AAPL",
  last_trade_price: "150.00",
  ask_price: "150.10",
  bid_price: "149.90",
  adjusted_previous_close: "148.00",
  previous_close: "148.00",
  pe_ratio: "25.5",
  last_extended_hours_trade_price: "150.50",
};

export const SAMPLE_POSITION = {
  instrument: "https://api.robinhood.com/instruments/abc123/",
  quantity: "10.0000",
  average_buy_price: "140.0000",
  account_number: "ABC12345",
};

export const SAMPLE_INSTRUMENT = {
  url: "https://api.robinhood.com/instruments/abc123/",
  id: "abc123",
  symbol: "AAPL",
  simple_name: "Apple",
  name: "Apple Inc.",
  type: "stock",
};

export const SAMPLE_OPTION = {
  url: "https://api.robinhood.com/options/instruments/opt123/",
  id: "opt123",
  type: "call",
  strike_price: "150.0000",
  expiration_date: "2025-01-17",
  state: "active",
  tradability: "tradable",
};

export function paginatedResponse(results: unknown[], nextUrl: string | null = null) {
  return { results, next: nextUrl, previous: null };
}
