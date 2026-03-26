/** MCP tools for L2 order book streaming. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStreamingManager } from "../../client/streaming/index.js";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerStreamingTools(server: McpServer): void {
  server.tool(
    "robinhood_subscribe_l2",
    "Start streaming L2 order book data for a symbol. The book populates asynchronously via WebSocket.",
    {
      symbol: z.string().describe("Stock symbol (e.g. SPY, AAPL)."),
    },
    async ({ symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const manager = getStreamingManager(rh._session);
        await manager.subscribeOrderBook(symbol.toUpperCase());
        return text({ status: "subscribed", symbol: symbol.toUpperCase() });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_order_book",
    "Get current L2 order book snapshot (bids and asks with price/size). Auto-subscribes if not already streaming.",
    {
      symbol: z.string().describe("Stock symbol (e.g. SPY, AAPL)."),
      depth: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe("Number of price levels per side (default 10)."),
    },
    async ({ symbol, depth }) => {
      try {
        const rh = await getAuthenticatedRh();
        const manager = getStreamingManager(rh._session);
        const snapshot = await manager.getOrderBookSnapshot(symbol.toUpperCase(), depth);
        return text(snapshot);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_unsubscribe_l2",
    "Stop streaming L2 order book data for a symbol.",
    {
      symbol: z.string().describe("Stock symbol (e.g. SPY, AAPL)."),
    },
    async ({ symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const manager = getStreamingManager(rh._session);
        manager.unsubscribeOrderBook(symbol.toUpperCase());
        return text({ status: "unsubscribed", symbol: symbol.toUpperCase() });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
