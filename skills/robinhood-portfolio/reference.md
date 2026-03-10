# Portfolio MCP Tools Reference

## robinhood_get_portfolio
Get complete portfolio: positions with P&L, equity, buying power, cash.

**Parameters:**
- `account_number` (string, optional) — specific account number
- `with_dividends` (boolean, default: false) — include dividend info per holding

**Response:**
```json
{
  "holdings": {
    "AAPL": {
      "price": "150.00",
      "quantity": "10",
      "average_buy_price": "120.00",
      "equity": "1500.00",
      "percent_change": "25.0",
      "intraday_percent_change": "1.2",
      "equity_change": "300.00",
      "type": "stock",
      "name": "Apple",
      "id": "instrument-uuid",
      "pe_ratio": "25.5",
      "dividend_rate": "0.55"  // only with with_dividends: true
    }
  },
  "summary": {
    "equity": "15000.00",
    "market_value": "14000.00",
    "cash": "1000.00",
    "buying_power": "2000.00",
    "crypto_buying_power": "500.00",
    "cash_available_for_withdrawal": "1000.00"
  },
  "portfolio_profile": { ... }
}
```

## robinhood_get_accounts
Get all brokerage accounts (multi-account support).

**Parameters:** none

**Response:**
```json
{
  "accounts": [
    {
      "url": "https://api.robinhood.com/accounts/123/",
      "account_number": "123",
      "type": "cash",
      "cash": "1000.00",
      "buying_power": "2000.00"
    }
  ]
}
```

## robinhood_get_account
Get account details, profile, and investment preferences.

**Parameters:**
- `info_type` (enum: "all", "account", "user", "investment", default: "all")

**Response:**
```json
{
  "account": { "account_number": "123", "buying_power": "2000.00", ... },
  "user": { "username": "user@email.com", "first_name": "John", ... },
  "investment": { "risk_tolerance": "moderate", ... }
}
```
