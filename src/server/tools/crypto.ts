/** Crypto data tool for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerCryptoTools(server: McpServer): void {
  server.tool(
    "robinhood_get_crypto",
    "Get crypto price data, history, and positions.",
    {
      symbol: z
        .string()
        .optional()
        .describe('Crypto symbol (e.g. "BTC", "ETH"). Required for quote/historicals.'),
      info_type: z
        .enum(["quote", "historicals", "positions"])
        .default("quote")
        .describe("What to return."),
      interval: z
        .enum(["15second", "5minute", "10minute", "hour", "day", "week"])
        .default("day")
        .describe("For historicals."),
      span: z
        .enum(["hour", "day", "week", "month", "3month", "year", "5year"])
        .default("month")
        .describe("For historicals."),
    },
    async ({ symbol, info_type, interval, span }) => {
      try {
        const rh = await getAuthenticatedRh();

        if (info_type === "positions") {
          const positions = await rh.getCryptoPositions();
          return text({ positions });
        }

        if (!symbol) {
          return textError("symbol is required for quote and historicals");
        }

        const s = symbol.trim().toUpperCase();

        if (info_type === "quote") {
          const quote = await rh.getCryptoQuote(s);
          return text({ quote });
        }

        if (info_type === "historicals") {
          const data = await rh.getCryptoHistoricals(s, { interval, span, bounds: "24_7" });
          return text({ historicals: data });
        }

        return textError(
          `Unknown info_type: ${info_type}. Use 'quote', 'historicals', or 'positions'.`,
        );
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
