# Options MCP Tools Reference

## robinhood_get_options
Get options chain with greeks for a stock symbol.

**Parameters:**
- `symbol` (string, required) — stock ticker
- `expiration_date` (string, optional) — filter by date "YYYY-MM-DD"
- `strike_price` (number, optional) — filter by strike
- `option_type` (enum: "call", "put", optional)

**Response:**
```json
{
  "chain_info": {
    "id": "chain-uuid",
    "symbol": "AAPL",
    "expiration_dates": ["2025-01-17", "2025-02-21", ...]
  },
  "options": [{
    "url": "...",
    "id": "option-uuid",
    "type": "call",
    "strike_price": "150.0000",
    "expiration_date": "2025-01-17",
    "state": "active",
    "tradability": "tradable"
  }],
  "market_data": [{
    "adjusted_mark_price": "3.50",
    "ask_price": "3.60",
    "bid_price": "3.40",
    "delta": "0.5500",
    "gamma": "0.0300",
    "theta": "-0.0500",
    "vega": "0.2000",
    "rho": "0.0100",
    "implied_volatility": "0.3000",
    "open_interest": 15000,
    "volume": 5000,
    "chance_of_profit_long": "0.4200",
    "chance_of_profit_short": "0.5800",
    "high_price": "4.00",
    "low_price": "3.00",
    "last_trade_price": "3.50"
  }]
}
```

Note: `market_data` is only included when all three filter parameters (`expiration_date`, `strike_price`, `option_type`) are provided.

## robinhood_place_option_order
Place a single-leg option order. See `robinhood-trade/reference.md` for full parameter details.

## robinhood_get_orders
Use with `order_type: "option"` to view option orders.
Use with `status: "open"` to see only active orders.
