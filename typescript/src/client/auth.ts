/**
 * Authentication via the auth proxy.
 *
 * The proxy (src/server/proxy.ts) holds tokens in the OS keychain and
 * injects Bearer headers. This module ensures the proxy is running and
 * triggers a token reload after browser login.
 */

import type { RobinhoodSession } from "./session.js";
import { getProxyToken, getProxyUrl } from "./urls.js";

/** Build headers for direct proxy control requests. */
function proxyHeaders(): Record<string, string> {
  const token = getProxyToken();
  return token ? { "X-Proxy-Token": token } : {};
}

export interface LoginResult {
  status: "logged_in";
  method: "proxy";
}

export async function restoreSession(_session: RobinhoodSession): Promise<LoginResult> {
  const { ensureProxy } = await import("../server/proxy.js");
  const proxyUrl = await ensureProxy();

  // Ask the proxy to reload tokens from keychain (picks up browser login changes)
  try {
    await fetch(`${proxyUrl}/reload-tokens`, {
      method: "POST",
      headers: proxyHeaders(),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Proxy might not support this endpoint yet, or network hiccup — not fatal
  }

  return { status: "logged_in", method: "proxy" };
}

export async function logout(_session: RobinhoodSession): Promise<void> {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return;

  try {
    await fetch(`${proxyUrl}/logout`, {
      method: "POST",
      headers: proxyHeaders(),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best effort
  }
}
