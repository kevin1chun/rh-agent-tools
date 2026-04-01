/**
 * Browser-based Robinhood authentication using Playwright.
 *
 * Opens system Chrome to robinhood.com/login. The user logs in normally
 * (including MFA via push, SMS, etc.). Playwright intercepts the OAuth
 * token response and stores it via the encrypted token store.
 */

import type { Browser } from "playwright-core";
import { chromium, type Request, type Response } from "playwright-core";
import { getClient } from "../client/index.js";
import { saveTokens } from "../client/token-store.js";

const LOGIN_URL = "https://robinhood.com/login";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface BrowserLoginResult {
  status: "logged_in";
  account_hint: string;
}

export async function browserLogin(): Promise<BrowserLoginResult> {
  let browser: Browser;
  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: false,
    });
  } catch {
    throw new Error("Chrome not found. Install Google Chrome to use browser-based login.");
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const tokenPromise = new Promise<{
      accessToken: string;
      refreshToken: string;
      tokenType: string;
      deviceToken: string;
    }>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Login timed out after 5 minutes.")),
        TIMEOUT_MS,
      );

      // Capture device_token from the request body (form-urlencoded or JSON)
      let capturedDeviceToken = "";

      page.on("request", (request: Request) => {
        if (request.url().includes("/oauth2/token")) {
          try {
            const postData = request.postData();
            if (!postData) return;

            // Try JSON first (Robinhood frontend sends JSON)
            try {
              const json = JSON.parse(postData) as Record<string, unknown>;
              if (typeof json.device_token === "string") {
                capturedDeviceToken = json.device_token;
                return;
              }
            } catch {
              // Not JSON — try form-urlencoded
            }

            const params = new URLSearchParams(postData);
            const dt = params.get("device_token");
            if (dt) capturedDeviceToken = dt;
          } catch {
            // Ignore parse errors
          }
        }
      });

      page.on("response", async (response: Response) => {
        if (!response.url().includes("/oauth2/token")) return;
        if (response.status() !== 200) return;

        try {
          const data = (await response.json()) as Record<string, unknown>;
          if (data.access_token) {
            // device_token may come from response if not captured from request
            const deviceToken = capturedDeviceToken || (data.device_token as string) || "";
            clearTimeout(timeout);
            resolve({
              accessToken: data.access_token as string,
              refreshToken: (data.refresh_token as string) ?? "",
              tokenType: (data.token_type as string) ?? "Bearer",
              deviceToken,
            });
          }
        } catch {
          // Not a JSON response or doesn't have access_token
        }
      });

      browser.on("disconnected", () => {
        clearTimeout(timeout);
        reject(new Error("Browser was closed before login completed."));
      });
    });

    await page.goto(LOGIN_URL);
    const tokens = await tokenPromise;

    // Save tokens to encrypted store
    await saveTokens({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: tokens.tokenType,
      device_token: tokens.deviceToken,
    });

    // Restore session in the client
    const rh = getClient();
    await rh.restoreSession();

    // Get account hint
    let accountHint = "";
    try {
      const profile = await rh.getAccountProfile();
      const acct = profile.account_number ?? "";
      accountHint = acct.length >= 4 ? `...${acct.slice(-4)}` : acct;
    } catch {
      // Skip
    }

    return { status: "logged_in", account_hint: accountHint };
  } finally {
    await browser.close().catch(() => {});
  }
}
