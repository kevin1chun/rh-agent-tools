import { describe, expect, it, vi } from "vitest";
import { StreamingAuth } from "../../../src/client/streaming/streaming-auth.js";

function createMockSession() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    getAuthTokenForRevocation: vi.fn(),
  };
}

function makeTokenResponse() {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      status: "SUCCESS",
      data: {
        status: "SUCCESS",
        data: {
          token: "test-streaming-token",
          wss_url: "wss://api.robinhood.com/marketdata/streaming/legend/v2/",
          expiration: "2026-03-18T21:08:36.945732047Z",
          ttl_ms: "14400000",
          dxfeed_id: "test_dxfeed_id",
        },
      },
    }),
  };
}

describe("StreamingAuth", () => {
  it("fetches a streaming token", async () => {
    const session = createMockSession();
    session.get.mockResolvedValue(makeTokenResponse());

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const auth = new StreamingAuth(session as any);
    const data = await auth.ensureToken();

    expect(data.token).toBe("test-streaming-token");
    expect(data.wss_url).toBe("wss://api.robinhood.com/marketdata/streaming/legend/v2/");
    expect(data.ttl_ms).toBe("14400000");

    // Verify the request was made with correct params
    expect(session.get).toHaveBeenCalledWith(
      expect.stringContaining("/marketdata/token/v1/"),
      expect.objectContaining({
        session_type: "blackwidow",
      }),
    );
  });

  it("caches the token and reuses it", async () => {
    const session = createMockSession();
    session.get.mockResolvedValue(makeTokenResponse());

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const auth = new StreamingAuth(session as any);

    await auth.ensureToken();
    await auth.ensureToken();

    // Should only fetch once
    expect(session.get).toHaveBeenCalledTimes(1);
  });

  it("refreshes when token is invalidated", async () => {
    const session = createMockSession();
    session.get.mockResolvedValue(makeTokenResponse());

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const auth = new StreamingAuth(session as any);

    await auth.ensureToken();
    auth.invalidate();
    await auth.ensureToken();

    expect(session.get).toHaveBeenCalledTimes(2);
  });

  it("throws StreamingAuthError on HTTP failure", async () => {
    const session = createMockSession();
    session.get.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("Unauthorized"),
    });

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const auth = new StreamingAuth(session as any);

    await expect(auth.ensureToken()).rejects.toThrow("Streaming token request failed");
  });

  it("throws StreamingAuthError on unexpected response shape", async () => {
    const session = createMockSession();
    session.get.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ unexpected: "shape" }),
    });

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const auth = new StreamingAuth(session as any);

    await expect(auth.ensureToken()).rejects.toThrow("Unexpected streaming token response");
  });
});
