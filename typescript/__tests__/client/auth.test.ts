import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../src/client/auth.js";
import { logout, restoreSession, restoreSessionFromToken } from "../../src/client/auth.js";
import { AuthenticationError } from "../../src/client/errors.js";
import type { RobinhoodSession } from "../../src/client/session.js";
import type { TokenData, TokenStore } from "../../src/client/token-store.js";

const sampleTokens: TokenData = {
  access_token: "tok123",
  refresh_token: "ref456",
  token_type: "Bearer",
  device_token: "dev789",
  saved_at: Date.now() / 1000,
};

function mockSession(): RobinhoodSession {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
    onUnauthorized: null,
  } as unknown as RobinhoodSession;
}

function mockStore(tokens: TokenData | null = sampleTokens): TokenStore {
  return {
    load: vi.fn().mockResolvedValue(tokens),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("restoreSession (token store)", () => {
  let session: RobinhoodSession;

  beforeEach(() => {
    vi.clearAllMocks();
    session = mockSession();
  });

  it("loads tokens from store and sets access token", async () => {
    const store = mockStore();
    const { result } = await restoreSession(session, store);
    expect(result.status).toBe("logged_in");
    expect(result.method).toBe("keychain");
    expect(store.load).toHaveBeenCalled();
    expect(session.setAccessToken).toHaveBeenCalledWith("tok123");
  });

  it("throws AuthenticationError when no tokens found", async () => {
    const store = mockStore(null);
    await expect(restoreSession(session, store)).rejects.toThrow(AuthenticationError);
  });

  it("registers onUnauthorized callback", async () => {
    const store = mockStore();
    await restoreSession(session, store);
    expect(session.onUnauthorized).toBeTypeOf("function");
  });
});

describe("restoreSessionFromToken", () => {
  it("sets access token directly", () => {
    const session = mockSession();
    const result = restoreSessionFromToken(session, "direct-token");
    expect(result.status).toBe("logged_in");
    expect(result.method).toBe("token");
    expect(session.setAccessToken).toHaveBeenCalledWith("direct-token");
  });
});

describe("logout", () => {
  // Mock global fetch for token revocation
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}")) as any;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("clears access token and onUnauthorized", async () => {
    const session = mockSession();
    const store = mockStore();
    const state: AuthState = { tokens: sampleTokens, store, refreshing: null, lastRefreshAt: 0 };

    await logout(session, state);

    expect(session.clearAccessToken).toHaveBeenCalled();
    expect(session.onUnauthorized).toBeNull();
  });

  it("attempts to revoke token at Robinhood", async () => {
    const session = mockSession();
    const store = mockStore();
    const state: AuthState = { tokens: sampleTokens, store, refreshing: null, lastRefreshAt: 0 };

    await logout(session, state);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.robinhood.com/oauth2/revoke_token/",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deletes from store", async () => {
    const session = mockSession();
    const store = mockStore();
    const state: AuthState = { tokens: sampleTokens, store, refreshing: null, lastRefreshAt: 0 };

    await logout(session, state);

    expect(store.delete).toHaveBeenCalled();
  });

  it("does not throw when state is null", async () => {
    const session = mockSession();
    await expect(logout(session, null)).resolves.toBeUndefined();
  });
});
