/** Options data tool for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerOptionsTools(server: McpServer): void {
  server.tool(
    "robinhood_get_options",
    "Get options chain with greeks for a stock symbol.",
    {
      symbol: z.string().describe("Stock ticker symbol."),
      expiration_date: z.string().optional().describe("Filter by expiration date (YYYY-MM-DD)."),
      strike_price: z.number().optional().describe("Filter by strike price."),
      option_type: z.enum(["call", "put"]).optional().describe("Filter by type."),
    },
    async ({ symbol, expiration_date, strike_price, option_type }) => {
      try {
        const rh = await getAuthenticatedRh();
        const s = symbol.trim().toUpperCase();
        const result: Record<string, unknown> = {};

        const chain = await rh.getChains(s);
        result.chain_info = chain;

        const options = await rh.findTradableOptions(s, {
          expirationDate: expiration_date,
          strikePrice: strike_price,
          optionType: option_type,
        });

        if (expiration_date && strike_price != null && option_type) {
          const marketData = await rh.getOptionMarketData(
            s,
            expiration_date,
            strike_price,
            option_type,
          );
          result.market_data = marketData;
        }

        result.options = options;
        return text(result);
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
