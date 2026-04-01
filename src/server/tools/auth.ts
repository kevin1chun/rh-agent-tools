/** Authentication tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserLogin } from "../browser-auth.js";
import { getRh, text, textError } from "./_helpers.js";

export function registerAuthTools(server: McpServer): void {
  server.tool(
    "robinhood_browser_login",
    "Authenticate with Robinhood by opening Chrome to the real login page. The user logs in normally (including MFA). This is the only way to authenticate — no credentials are passed through the tool.",
    {},
    async () => {
      try {
        const result = await browserLogin();
        return text(result);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_check_session",
    "Check if there is a valid cached Robinhood session. Returns session status without opening a browser or requiring credentials.",
    {},
    async () => {
      try {
        const { AuthenticationError } = await import("../../client/index.js");
        const rh = getRh();
        try {
          const result = await rh.restoreSession();
          let accountHint = "";
          try {
            const profile = await rh.getAccountProfile();
            const acct = profile.account_number ?? "";
            accountHint = acct.length >= 4 ? `...${acct.slice(-4)}` : acct;
          } catch {
            // Skip
          }
          return text({
            status: "logged_in",
            method: result.method,
            account_hint: accountHint,
          });
        } catch (e) {
          if (e instanceof AuthenticationError) {
            return text({
              status: "not_authenticated",
              message: String(e),
            });
          }
          throw e;
        }
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
