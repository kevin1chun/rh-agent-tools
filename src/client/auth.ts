/**
 * Session restore and token refresh for Robinhood API.
 *
 * Browser-based login is handled at the server level (browser-auth.ts).
 * This module only handles restoring cached sessions and refreshing tokens.
 */

import { AuthenticationError } from "./errors.js";
import type { RobinhoodSession } from "./session.js";
import { deleteTokens, loadTokens, saveTokens } from "./token-store.js";
import * as urls from "./urls.js";

const CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS";
const EXPIRATION_TIME = 734000; // ~8.5 days, matches pyrh

export interface LoginResult {
  status: "logged_in";
  method: "cached" | "refreshed";
  device_token: string;
}

async function validateToken(session: RobinhoodSession): Promise<boolean> {
  try {
    const resp = await session.get(`${urls.API_BASE}/positions/`, { nonzero: "true" });
    return resp.ok;
  } catch {
    return false;
  }
}

async function attemptTokenRefresh(
  session: RobinhoodSession,
  opts: { refreshToken: string; deviceToken: string },
): Promise<LoginResult | null> {
  const payload: Record<string, string | number> = {
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    scope: "internal",
    client_id: CLIENT_ID,
    expires_in: EXPIRATION_TIME,
    device_token: opts.deviceToken,
  };
  const resp = await session.post(urls.oauthToken(), payload);
  if (!resp.ok) return null;

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!("access_token" in data)) return null;

  session.setAuth(data.access_token as string);
  await saveTokens({
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) ?? opts.refreshToken,
    token_type: (data.token_type as string) ?? "Bearer",
    device_token: opts.deviceToken,
  });
  return { status: "logged_in", method: "refreshed", device_token: opts.deviceToken };
}

export async function restoreSession(session: RobinhoodSession): Promise<LoginResult> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new AuthenticationError("Not authenticated. Use robinhood_browser_login to sign in.");
  }

  // Try the cached access token
  session.setAuth(tokens.access_token);
  if (await validateToken(session)) {
    return {
      status: "logged_in",
      method: "cached",
      device_token: tokens.device_token ?? "",
    };
  }

  // Token invalid — try refresh
  session.clearAuth();
  if (tokens.refresh_token) {
    try {
      const result = await attemptTokenRefresh(session, {
        refreshToken: tokens.refresh_token,
        deviceToken: tokens.device_token ?? "",
      });
      if (result) return result;
    } catch {
      // Refresh failed — fall through
    }
  }

  throw new AuthenticationError("Session expired. Use robinhood_browser_login to re-authenticate.");
}

export async function logout(session: RobinhoodSession): Promise<void> {
  const token = session.getAuthToken();
  if (token) {
    try {
      await session.post(urls.oauthRevoke(), { client_id: CLIENT_ID, token });
    } catch {
      // Best effort
    }
  }
  session.clearAuth();
  deleteTokens();
}
