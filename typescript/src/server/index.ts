/** Entry point for robinhood-for-agents MCP server. */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

export { createServer } from "./server.js";

export async function main(): Promise<void> {
  // Start or connect to the auth proxy before opening the MCP transport.
  // Failure here is non-fatal — the proxy will be started lazily on first
  // restoreSession() call if needed.
  try {
    const { ensureProxy } = await import("./proxy.js");
    await ensureProxy();
  } catch {
    // Will retry on first authenticated call
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
