/** Order placement, history, and management tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerOrderTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Place stock order
  // -------------------------------------------------------------------------
  server.tool(
    "robinhood_place_stock_order",
    "Place a stock order. Requires explicit parameters — no dangerous defaults. Always confirm with the user before calling.",
    {
      symbol: z.string().describe("Stock ticker symbol (e.g. AAPL)."),
      side: z.enum(["buy", "sell"]).describe("Order side."),
      quantity: z.number().describe("Number of shares (supports fractional)."),
      limit_price: z
        .number()
        .optional()
        .describe("Limit price. Required for limit and stop-limit orders."),
      stop_price: z
        .number()
        .optional()
        .describe("Stop price. Required for stop and stop-limit orders."),
      trail_amount: z
        .number()
        .optional()
        .describe("Trailing stop amount. Sets order type to trailing stop."),
      trail_type: z
        .enum(["percentage", "amount"])
        .default("percentage")
        .describe("Trailing stop type."),
      time_in_force: z
        .enum(["gtc", "gfd"])
        .default("gtc")
        .describe("Time in force: good till cancelled or good for day."),
      extended_hours: z.boolean().default(false).describe("Allow extended hours execution."),
      account_number: z
        .string()
        .describe("Robinhood account number. Get from robinhood_get_accounts."),
    },
    async ({
      symbol,
      side,
      quantity,
      limit_price,
      stop_price,
      trail_amount,
      trail_type,
      time_in_force,
      extended_hours,
      account_number,
    }) => {
      try {
        const rh = await getAuthenticatedRh();
        const order = await rh.orderStock(symbol, side, quantity, {
          limitPrice: limit_price,
          stopPrice: stop_price,
          trailAmount: trail_amount,
          trailType: trail_type,
          timeInForce: time_in_force,
          extendedHours: extended_hours,
          accountNumber: account_number,
        });
        return text({ status: "submitted", order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  // -------------------------------------------------------------------------
  // Place option order (single-leg or multi-leg spreads)
  // -------------------------------------------------------------------------
  server.tool(
    "robinhood_place_option_order",
    "Place a single-leg or multi-leg option order (verticals, iron condors, straddles, etc.). Always confirm with the user before calling.",
    {
      symbol: z.string().describe("Underlying stock ticker symbol."),
      legs: z
        .array(
          z.object({
            expiration_date: z.string().describe("Expiration date (YYYY-MM-DD)."),
            strike: z.number().describe("Strike price."),
            option_type: z.enum(["call", "put"]).describe("Option type."),
            side: z.enum(["buy", "sell"]).describe("Buy or sell this leg."),
            position_effect: z.enum(["open", "close"]).describe("Opening or closing."),
            ratio_quantity: z.number().default(1).describe("Ratio quantity for this leg."),
          }),
        )
        .describe("Option legs. Single-leg for simple orders, multiple legs for spreads."),
      price: z.number().describe("Limit price per contract (single-leg) or net price (spreads)."),
      quantity: z.number().describe("Number of contracts."),
      direction: z
        .enum(["debit", "credit"])
        .describe("Debit for buys/debit spreads, credit for sells/credit spreads."),
      stop_price: z
        .number()
        .optional()
        .describe("Stop price. When set, order triggers as stop-limit."),
      time_in_force: z.enum(["gtc", "gfd", "ioc", "opg"]).default("gfd").describe("Time in force."),
      account_number: z
        .string()
        .describe("Robinhood account number. Get from robinhood_get_accounts."),
    },
    async ({
      symbol,
      legs,
      price,
      quantity,
      direction,
      stop_price,
      time_in_force,
      account_number,
    }) => {
      try {
        const rh = await getAuthenticatedRh();
        const order = await rh.orderOption(
          symbol,
          legs.map((l) => ({
            expirationDate: l.expiration_date,
            strike: l.strike,
            optionType: l.option_type,
            side: l.side,
            positionEffect: l.position_effect,
            ratioQuantity: l.ratio_quantity,
          })),
          price,
          quantity,
          direction,
          {
            stopPrice: stop_price,
            timeInForce: time_in_force,
            accountNumber: account_number,
          },
        );
        return text({ status: "submitted", order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  // -------------------------------------------------------------------------
  // Place crypto order
  // -------------------------------------------------------------------------
  server.tool(
    "robinhood_place_crypto_order",
    "Place a crypto order. Always confirm with the user before calling.",
    {
      symbol: z.string().describe('Crypto symbol (e.g. "BTC", "ETH").'),
      side: z.enum(["buy", "sell"]).describe("Order side."),
      amount_or_quantity: z.number().describe("Quantity or dollar amount depending on amount_in."),
      amount_in: z
        .enum(["quantity", "price"])
        .default("quantity")
        .describe("Whether amount_or_quantity is a coin quantity or dollar amount."),
      order_type: z.enum(["market", "limit"]).default("market").describe("Order type."),
      limit_price: z.number().optional().describe("Limit price. Required for limit orders."),
    },
    async ({ symbol, side, amount_or_quantity, amount_in, order_type, limit_price }) => {
      try {
        const rh = await getAuthenticatedRh();
        const order = await rh.orderCrypto(symbol, side, amount_or_quantity, {
          amountIn: amount_in,
          orderType: order_type,
          limitPrice: limit_price,
        });
        return text({ status: "submitted", order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  // -------------------------------------------------------------------------
  // Get orders (history)
  // -------------------------------------------------------------------------
  server.tool(
    "robinhood_get_orders",
    "Get order history for stocks, options, or crypto.",
    {
      order_type: z
        .enum(["stock", "option", "crypto"])
        .default("stock")
        .describe("Type of orders to retrieve."),
      status: z.enum(["open", "all"]).default("all").describe("Filter by order status."),
      account_number: z.string().optional().describe("Account number for multi-account."),
      limit: z.number().default(50).describe("Maximum orders to return. 0 for unlimited."),
    },
    async ({ order_type, status, account_number, limit }) => {
      try {
        const rh = await getAuthenticatedRh();
        const accountOpts = account_number ? { accountNumber: account_number } : undefined;

        let orders: unknown[];

        if (order_type === "stock") {
          orders =
            status === "open"
              ? await rh.getOpenStockOrders(accountOpts)
              : await rh.getAllStockOrders(accountOpts);
        } else if (order_type === "option") {
          orders =
            status === "open"
              ? await rh.getOpenOptionOrders(accountOpts)
              : await rh.getAllOptionOrders(accountOpts);
        } else {
          orders =
            status === "open"
              ? await rh.getOpenCryptoOrders(accountOpts)
              : await rh.getAllCryptoOrders(accountOpts);
        }

        if (limit > 0) {
          orders = orders.slice(0, limit);
        }

        return text({ orders, order_type, status });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  // -------------------------------------------------------------------------
  // Cancel order
  // -------------------------------------------------------------------------
  server.tool(
    "robinhood_cancel_order",
    "Cancel a pending order by its ID.",
    {
      order_id: z.string().describe("The order UUID to cancel."),
      order_type: z.enum(["stock", "option", "crypto"]).default("stock").describe("Type of order."),
    },
    async ({ order_id, order_type }) => {
      try {
        const rh = await getAuthenticatedRh();

        if (order_type === "stock") {
          await rh.cancelStockOrder(order_id);
        } else if (order_type === "option") {
          await rh.cancelOptionOrder(order_id);
        } else {
          await rh.cancelCryptoOrder(order_id);
        }

        return text({ status: "cancelled", order_id });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  // -------------------------------------------------------------------------
  // Get order status
  // -------------------------------------------------------------------------
  server.tool(
    "robinhood_get_order_status",
    "Get the current status of a specific order by its ID.",
    {
      order_id: z.string().describe("The order UUID."),
      order_type: z.enum(["stock", "option", "crypto"]).default("stock").describe("Type of order."),
    },
    async ({ order_id, order_type }) => {
      try {
        const rh = await getAuthenticatedRh();
        let order: unknown;

        if (order_type === "stock") {
          order = await rh.getStockOrder(order_id);
        } else if (order_type === "option") {
          order = await rh.getOptionOrder(order_id);
        } else {
          order = await rh.getCryptoOrder(order_id);
        }

        return text({ order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
