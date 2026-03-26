/** MCP server for robinhood-for-agents. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../../package.json" with { type: "json" };
import { registerAuthTools } from "./tools/auth.js";
import { registerCryptoTools } from "./tools/crypto.js";
import { registerMarketTools } from "./tools/markets.js";
import { registerOptionsTools } from "./tools/options.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerStockTools } from "./tools/stocks.js";
import { registerStreamingTools } from "./tools/streaming.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "robinhood-for-agents",
    version: pkg.version,
  });

  registerAuthTools(server);
  registerPortfolioTools(server);
  registerStockTools(server);
  registerOptionsTools(server);
  registerCryptoTools(server);
  registerOrderTools(server);
  registerMarketTools(server);
  registerStreamingTools(server);

  return server;
}
