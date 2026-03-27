/** Market movers tool for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerMarketTools(server: McpServer): void {
  server.tool(
    "robinhood_get_movers",
    "Get market movers and popular stocks.",
    {
      category: z
        .enum(["top_movers", "sp500", "top_100"])
        .default("top_movers")
        .describe("What to fetch."),
      direction: z.enum(["up", "down"]).optional().describe("For sp500 movers - direction."),
    },
    async ({ category, direction }) => {
      try {
        const rh = await getAuthenticatedRh();

        if (category === "sp500") {
          if (!direction) {
            return textError("direction ('up' or 'down') is required for sp500 movers");
          }
          const data = await rh.getTopMoversSp500(direction);
          return text({ category: "sp500", direction, movers: data });
        }

        if (category === "top_100") {
          const data = await rh.getTop100();
          return text({ category: "top_100", stocks: data });
        }

        const data = await rh.getTopMovers();
        return text({ category: "top_movers", movers: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
