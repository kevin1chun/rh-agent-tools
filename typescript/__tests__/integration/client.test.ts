/**
 * Integration tests — hit the real Robinhood API via TokenStore auth.
 *
 * Prerequisites:
 *   1. Login: robinhood-for-agents onboard
 *
 * Run: bun run test:integration
 *
 * Uses Bun's test runner (not Vitest) because Bun.secrets is needed
 * to load tokens from the OS keychain. Vitest runs in Node where
 * Bun.secrets is unavailable.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { RobinhoodClient } from "../../src/client/index.js";

describe("integration: RobinhoodClient", () => {
  const client = new RobinhoodClient();

  beforeAll(async () => {
    await client.restoreSession();
  });

  it("authenticates via TokenStore", () => {
    expect(client.isLoggedIn).toBe(true);
  });

  it("gets accounts", async () => {
    const accounts = await client.getAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]?.account_number).toBeDefined();
  });

  it("gets portfolio profile", async () => {
    const portfolio = await client.getPortfolioProfile();
    expect(portfolio.equity).toBeDefined();
  });

  it("gets user profile", async () => {
    const user = await client.getUserProfile();
    expect(user.username).toBeDefined();
  });

  it("gets stock quotes", async () => {
    const quotes = await client.getQuotes("AAPL");
    expect(quotes.length).toBe(1);
    expect(quotes[0]?.last_trade_price).not.toBeNull();
  });

  it("gets fundamentals", async () => {
    const fundamentals = await client.getFundamentals(["AAPL"]);
    expect(fundamentals.length).toBeGreaterThan(0);
    expect(fundamentals[0]?.market_cap).toBeDefined();
  });

  it("gets stock historicals", async () => {
    const historicals = await client.getStockHistoricals("AAPL", {
      interval: "day",
      span: "week",
    });
    expect(historicals.length).toBeGreaterThan(0);
    expect(historicals[0]?.historicals.length).toBeGreaterThan(0);
  });

  it("gets news", async () => {
    const news = await client.getNews("AAPL");
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]?.title).toBeDefined();
  });

  it("finds instruments", async () => {
    const instruments = await client.findInstruments("AAPL");
    expect(instruments.length).toBeGreaterThan(0);
    expect(instruments[0]?.symbol).toBe("AAPL");
  });

  it("gets positions", async () => {
    const positions = await client.getPositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it("gets latest price", async () => {
    const prices = await client.getLatestPrice(["AAPL", "MSFT"]);
    expect(prices.length).toBe(2);
    for (const price of prices) {
      expect(Number(price)).toBeGreaterThan(0);
    }
  });
});
