/**
 * Auth proxy server — injects Bearer tokens into requests forwarded to
 * Robinhood APIs. Tokens never leave the proxy process.
 *
 * Path-prefix routing:
 *   /rh/...          → api.robinhood.com/...
 *   /nummus/...      → nummus.robinhood.com/...
 *   /health          → 200 OK
 *   /reload-tokens   → reload tokens from keychain
 *   /logout          → revoke token + clear keychain
 *
 * In local dev the proxy is auto-started in-process by ensureProxy().
 * In Docker it runs standalone on the host via `robinhood-for-agents proxy`.
 */

import { AuthenticationError } from "../client/errors.js";
import {
  deleteProxyToken,
  deleteTokens,
  loadProxyToken,
  loadTokens,
  saveProxyToken,
  saveTokens,
  type TokenData,
} from "../client/token-store.js";
import { configureProxy } from "../client/urls.js";
import { redactTokens } from "../redact.js";

const CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS";
const EXPIRATION_TIME = 734000;

interface ProxyState {
  tokens: TokenData;
  refreshing: Promise<boolean> | null;
}

const ROUTES: Record<string, string> = {
  "/rh": "https://api.robinhood.com",
  "/nummus": "https://nummus.robinhood.com",
};

/** Headers safe to forward from the client to Robinhood upstream. */
export const FORWARD_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "content-length",
  "x-robinhood-api-version",
  "user-agent",
]);

/** Constant-time comparison to prevent timing attacks on the proxy token. */
function verifyProxyToken(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function resolveUpstream(pathname: string): { upstream: string; path: string } | null {
  for (const [prefix, origin] of Object.entries(ROUTES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return { upstream: origin, path: pathname.slice(prefix.length) || "/" };
    }
  }
  return null;
}

async function refreshTokens(state: ProxyState): Promise<boolean> {
  const { tokens } = state;
  if (!tokens.refresh_token || !tokens.device_token) return false;

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

  if (!resp.ok) return false;

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    return false;
  }

  if (!("access_token" in data)) return false;

  const newTokens = {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) ?? tokens.refresh_token,
    token_type: (data.token_type as string) ?? "Bearer",
    device_token: tokens.device_token,
  };

  try {
    await saveTokens(newTokens);
  } catch {
    // Keychain unavailable — tokens live in memory only until next save
  }
  state.tokens = { ...newTokens, saved_at: Date.now() / 1000 };
  return true;
}

function forwardRequest(
  req: Request,
  upstreamOrigin: string,
  upstreamPath: string,
  accessToken: string,
  body: ArrayBuffer | null,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${upstreamOrigin}${upstreamPath}${url.search}`;

  // Allowlist headers — don't forward cookies, x-forwarded-*, or other container headers
  const headers = new Headers();
  for (const [key, value] of req.headers) {
    if (FORWARD_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  headers.set("Authorization", `Bearer ${accessToken}`);

  const init: RequestInit = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(30_000),
  };

  if (body) {
    init.body = body;
  }

  return fetch(target, init).then(async (upstream) => {
    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete("authorization");
    // Bun's fetch auto-decompresses the body, so strip encoding/length
    // headers to avoid the client double-decompressing (ZlibError).
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");
    // Disable Bun.serve auto-compression to prevent double-encoding
    respHeaders.set("Content-Encoding", "identity");

    // Fully buffer the decompressed body to avoid streaming ZlibErrors
    const responseBody = await upstream.arrayBuffer();

    const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (responseBody.byteLength > MAX_RESPONSE_BYTES) {
      return new Response(JSON.stringify({ error: "Response too large" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  });
}

// ---------------------------------------------------------------------------
// Proxy lifecycle
// ---------------------------------------------------------------------------

/** Active in-process proxy, if any. */
let activeServer: { server: ReturnType<typeof Bun.serve>; url: string; token: string } | null =
  null;

/**
 * Start the auth proxy server. Loads tokens from keychain.
 * Returns the Bun server instance, its URL, and a shared secret token.
 */
export async function startProxy(opts: {
  port: number;
  host: string;
}): Promise<{ server: ReturnType<typeof Bun.serve>; url: string; token: string }> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new AuthenticationError("Not authenticated. Use robinhood_browser_login to sign in.");
  }

  const state: ProxyState = { tokens, refreshing: null };
  const proxyToken = process.env.ROBINHOOD_PROXY_TOKEN?.trim() || crypto.randomUUID();
  await saveProxyToken(proxyToken);

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host,
    async fetch(req) {
      const url = new URL(req.url);
      const start = performance.now();

      // Health check — no token required (exposes no sensitive data)
      if (url.pathname === "/health") {
        const elapsed = (performance.now() - start).toFixed(1);
        console.error(`${req.method} /health 200 ${elapsed}ms`);
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Verify proxy token on all non-health endpoints (constant-time)
      if (!verifyProxyToken(req.headers.get("x-proxy-token"), proxyToken)) {
        const elapsed = (performance.now() - start).toFixed(1);
        console.error(`${req.method} ${url.pathname} 403 ${elapsed}ms`);
        return new Response(JSON.stringify({ error: "Missing or invalid proxy token" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Reload tokens from keychain (called after browser login)
      if (url.pathname === "/reload-tokens" && req.method === "POST") {
        const fresh = await loadTokens();
        if (fresh) {
          state.tokens = fresh;
          console.error("Tokens reloaded from keychain");
          return new Response(JSON.stringify({ status: "reloaded" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "No tokens in keychain" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Logout: revoke token + clear keychain
      if (url.pathname === "/logout" && req.method === "POST") {
        try {
          const revokeBody = new URLSearchParams({
            client_id: CLIENT_ID,
            token: state.tokens.access_token,
          });
          await fetch("https://api.robinhood.com/oauth2/revoke_token/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: revokeBody.toString(),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          // Best effort
        }
        state.tokens = {
          access_token: "",
          refresh_token: "",
          token_type: "",
          device_token: "",
          saved_at: 0,
        };
        await deleteTokens();
        await deleteProxyToken();
        // Reset so the next ensureProxy() call re-initializes after re-login
        ensurePromise = null;
        const elapsed = (performance.now() - start).toFixed(1);
        console.error(`POST /logout 200 ${elapsed}ms`);
        return new Response(JSON.stringify({ status: "logged_out" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Route to upstream
      const route = resolveUpstream(url.pathname);
      if (!route) {
        const elapsed = (performance.now() - start).toFixed(1);
        console.error(`${req.method} ${url.pathname} 404 ${elapsed}ms`);
        return new Response(JSON.stringify({ error: "Unknown route" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        // Buffer body before first attempt so it survives a 401 retry
        let bodyBuffer: ArrayBuffer | null = null;
        if (req.method !== "GET" && req.method !== "HEAD") {
          bodyBuffer = await req.arrayBuffer();
        }

        let resp = await forwardRequest(
          req,
          route.upstream,
          route.path,
          state.tokens.access_token,
          bodyBuffer,
        );

        // On 401, attempt token refresh and retry once.
        // Single-retry guard: concurrent 401s share one refresh promise
        // (via state.refreshing). Each request retries at most once — if the
        // retried request also gets 401, it is returned as-is (no loop).
        if (resp.status === 401) {
          if (!state.refreshing) {
            state.refreshing = refreshTokens(state).finally(() => {
              state.refreshing = null;
            });
          }
          const refreshed = await state.refreshing;
          if (refreshed) {
            resp = await forwardRequest(
              req,
              route.upstream,
              route.path,
              state.tokens.access_token,
              bodyBuffer,
            );
          }
        }

        const elapsed = (performance.now() - start).toFixed(1);
        console.error(`${req.method} ${url.pathname} ${resp.status} ${elapsed}ms`);
        return resp;
      } catch (err) {
        const elapsed = (performance.now() - start).toFixed(1);
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${req.method} ${url.pathname} 502 ${elapsed}ms`);
        return new Response(JSON.stringify({ error: redactTokens(msg) }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });

  const proxyUrl = `http://${opts.host}:${server.port}`;
  activeServer = { server, url: proxyUrl, token: proxyToken };
  console.error(`Auth proxy listening on ${proxyUrl}`);
  console.error("Routes: /rh/* → api.robinhood.com, /nummus/* → nummus.robinhood.com");
  return activeServer;
}

// ---------------------------------------------------------------------------
// ensureProxy — single entry point for proxy lifecycle
// ---------------------------------------------------------------------------

let ensurePromise: Promise<string> | null = null;

/**
 * Ensure the auth proxy is running. Returns the proxy base URL.
 *
 * - If ROBINHOOD_API_PROXY is set (Docker), health-checks the external proxy.
 * - If a proxy is already running in-process, returns its URL.
 * - Otherwise, starts the proxy in-process on 127.0.0.1:3100.
 *
 * Concurrent calls share the same promise. On failure the promise resets
 * so the next call can retry (e.g. after browser login provides tokens).
 *
 * NOTE: Only the first call's `opts` (port, host) take effect. Subsequent
 * calls return the cached promise regardless of opts — the proxy is a
 * singleton within a process.
 */
export function ensureProxy(opts?: { port?: number; host?: string }): Promise<string> {
  if (!ensurePromise) {
    ensurePromise = doEnsureProxy(opts).catch((e) => {
      ensurePromise = null;
      throw e;
    });
  }
  return ensurePromise;
}

async function doEnsureProxy(opts?: { port?: number; host?: string }): Promise<string> {
  const port = opts?.port ?? 3100;
  const host = opts?.host ?? "127.0.0.1";

  // Docker mode: external proxy specified via env var
  const envProxy = process.env.ROBINHOOD_API_PROXY?.trim().replace(/\/$/, "");
  if (envProxy) {
    const resp = await fetch(`${envProxy}/health`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new AuthenticationError("Auth proxy unreachable");
    const envToken = process.env.ROBINHOOD_PROXY_TOKEN?.trim();
    configureProxy(envProxy, envToken);
    return envProxy;
  }

  // Already started in this process
  if (activeServer) {
    configureProxy(activeServer.url, activeServer.token);
    return activeServer.url;
  }

  // Check if proxy is already running on the default port (e.g. standalone `proxy` command)
  const defaultUrl = `http://${host}:${port}`;
  try {
    const resp = await fetch(`${defaultUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const keychainToken = await loadProxyToken();
      configureProxy(defaultUrl, keychainToken ?? undefined);
      return defaultUrl;
    }
  } catch {
    // Not running — start it
  }

  // Start in-process
  const { url, token } = await startProxy({ port, host });
  configureProxy(url, token);
  return url;
}
