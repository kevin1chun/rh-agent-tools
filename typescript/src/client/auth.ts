/**
 * Authentication — load tokens from a TokenStore and inject into the session.
 *
 * Token refresh (on 401) is handled automatically via the session's
 * onUnauthorized callback. The refresh logic is ported from the former
 * auth proxy (proxy.ts).
 */

import { AuthenticationError } from "./errors.js";
import type { RobinhoodSession } from "./session.js";
import type { TokenData, TokenStore } from "./token-store.js";

const CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS";
const EXPIRATION_TIME = 734000;

export interface LoginResult {
  status: "logged_in";
  method: "keychain" | "encrypted_file" | "token";
}

const MIN_REFRESH_INTERVAL_MS = 5_000;

/** State held per-client for token management. */
export interface AuthState {
  tokens: TokenData;
  store: TokenStore;
  refreshing: Promise<string | null> | null;
  lastRefreshAt: number;
}

/**
 * Refresh the access token using the refresh_token + device_token.
 * Returns the new access token on success, null on failure.
 */
async function refreshTokens(state: AuthState): Promise<string | null> {
  const { tokens, store } = state;
  if (!tokens.refresh_token || !tokens.device_token) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    scope: "internal",
    client_id: CLIENT_ID,
    expires_in: String(EXPIRATION_TIME),
    device_token: tokens.device_token,
  });

  const resp = await fetch("https://api.robinhood.com/oauth2/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "X-Robinhood-API-Version": "1.431.4",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return null;

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!("access_token" in data)) return null;

  const newTokens: TokenData = {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) ?? tokens.refresh_token,
    token_type: (data.token_type as string) ?? "Bearer",
    device_token: tokens.device_token,
    saved_at: Date.now() / 1000,
  };

  // Update in-memory state
  state.tokens = newTokens;

  // Persist to store (best-effort)
  try {
    await store.save(newTokens);
  } catch {
    // Store unavailable — tokens live in memory only
  }

  return newTokens.access_token;
}

/**
 * Create a 401-refresh callback with a per-instance concurrency guard.
 * Multiple concurrent 401s share a single refresh attempt.
 */
function createRefreshCallback(state: AuthState): () => Promise<string | null> {
  return async () => {
    if (state.refreshing) {
      return state.refreshing;
    }
    // Rate limit: refuse to refresh if the last attempt was too recent
    if (Date.now() - state.lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
      return null;
    }
    state.lastRefreshAt = Date.now();
    state.refreshing = refreshTokens(state).finally(() => {
      state.refreshing = null;
    });
    return state.refreshing;
  };
}

/**
 * Restore a session by loading tokens from the store and configuring
 * the session for direct API access with automatic token refresh.
 */
export async function restoreSession(
  session: RobinhoodSession,
  store: TokenStore,
): Promise<{ result: LoginResult; state: AuthState }> {
  const tokens = await store.load();
  if (!tokens) {
    throw new AuthenticationError(
      "No tokens found. Run 'robinhood-for-agents onboard' to authenticate.",
    );
  }

  // Set access token on the session for Bearer injection
  session.setAccessToken(tokens.access_token);

  // Build auth state for refresh management
  const state: AuthState = {
    tokens,
    store,
    refreshing: null,
    lastRefreshAt: 0,
  };

  // Register 401 callback for automatic token refresh
  session.onUnauthorized = createRefreshCallback(state);

  const method = store.constructor.name.includes("Encrypted") ? "encrypted_file" : "keychain";

  return {
    result: { status: "logged_in", method },
    state,
  };
}

/**
 * Restore a session from a direct access token (no store, no refresh).
 */
export function restoreSessionFromToken(
  session: RobinhoodSession,
  accessToken: string,
): LoginResult {
  session.setAccessToken(accessToken);
  // No onUnauthorized — 401 will propagate as TokenExpiredError
  return { status: "logged_in", method: "token" };
}

/**
 * Logout — revoke the token and clear the store.
 */
export async function logout(session: RobinhoodSession, state: AuthState | null): Promise<void> {
  if (state?.tokens.access_token) {
    // Attempt to revoke the token at Robinhood
    try {
      await fetch("https://api.robinhood.com/oauth2/revoke_token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          token: state.tokens.access_token,
        }).toString(),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Best effort
    }

    // Clear the store
    try {
      await state.store.delete();
    } catch {
      // Best effort
    }
  }

  session.clearAccessToken();
  session.onUnauthorized = null;
}
