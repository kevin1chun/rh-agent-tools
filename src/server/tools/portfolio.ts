/** Portfolio and account tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerPortfolioTools(server: McpServer): void {
  server.tool(
    "robinhood_get_portfolio",
    "Get complete portfolio: positions with P&L, equity, buying power, cash.",
    {
      account_number: z
        .string()
        .optional()
        .describe("Specific account number, or omit for default."),
      with_dividends: z.boolean().default(false).describe("Include dividend info per holding."),
    },
    async ({ account_number, with_dividends }) => {
      try {
        const rh = await getAuthenticatedRh();
        const holdings = await rh.buildHoldings({
          accountNumber: account_number,
          withDividends: with_dividends,
        });
        const accountProfile = await rh.getAccountProfile(account_number);
        const portfolioProfile = await rh.getPortfolioProfile(account_number);

        return text({
          holdings,
          summary: {
            equity: portfolioProfile.equity,
            market_value: portfolioProfile.market_value,
            cash: accountProfile.cash,
            buying_power: accountProfile.buying_power,
            crypto_buying_power: accountProfile.crypto_buying_power,
            cash_available_for_withdrawal: accountProfile.cash_available_for_withdrawal,
          },
          portfolio_profile: portfolioProfile,
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_accounts",
    "Get all brokerage accounts (multi-account support).",
    {},
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const accounts = await rh.getAccounts({ allAccounts: true });
        return text({ accounts });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_account",
    "Get account details, profile, and investment preferences.",
    {
      info_type: z
        .enum(["all", "account", "user", "investment"])
        .default("all")
        .describe("What to return."),
    },
    async ({ info_type }) => {
      try {
        const rh = await getAuthenticatedRh();
        const result: Record<string, unknown> = {};
        if (info_type === "all" || info_type === "account") {
          result.account = await rh.getAccountProfile();
        }
        if (info_type === "all" || info_type === "user") {
          result.user = await rh.getUserProfile();
        }
        if (info_type === "all" || info_type === "investment") {
          result.investment = await rh.getInvestmentProfile();
        }
        return text(result);
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
