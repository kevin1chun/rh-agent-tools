import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the proxy module
vi.mock("../../src/server/proxy.js", () => ({
  ensureProxy: vi.fn().mockResolvedValue("http://127.0.0.1:3100"),
}));

// Mock urls module
vi.mock("../../src/client/urls.js", () => ({
  getProxyUrl: vi.fn().mockReturnValue("http://127.0.0.1:3100"),
  getProxyToken: vi.fn().mockReturnValue("test-proxy-token"),
  configureProxy: vi.fn(),
  API_BASE: "http://127.0.0.1:3100/rh",
  NUMMUS_BASE: "http://127.0.0.1:3100/nummus",
  UPSTREAM_API: "https://api.robinhood.com",
  UPSTREAM_NUMMUS: "https://nummus.robinhood.com",
}));

import type { Mock } from "vitest";
import { logout, restoreSession } from "../../src/client/auth.js";
import type { RobinhoodSession } from "../../src/client/session.js";
import { getProxyUrl } from "../../src/client/urls.js";

function mockSession(): RobinhoodSession {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  } as unknown as RobinhoodSession;
}

// Mock global fetch
const originalFetch = globalThis.fetch;
let mockFetch: Mock;

describe("restoreSession (proxy mode)", () => {
  let session: RobinhoodSession;

  beforeEach(() => {
    vi.clearAllMocks();
    session = mockSession();
    mockFetch = vi.fn().mockResolvedValue(new Response("{}"));
    // biome-ignore lint/suspicious/noExplicitAny: test mock -- need to assign mock to globalThis.fetch
    globalThis.fetch = mockFetch as any;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns proxy method", async () => {
    const result = await restoreSession(session);
    expect(result.status).toBe("logged_in");
    expect(result.method).toBe("proxy");
  });

  it("calls /reload-tokens on the proxy", async () => {
    await restoreSession(session);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3100/reload-tokens",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not throw if /reload-tokens fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const result = await restoreSession(session);
    expect(result.status).toBe("logged_in");
  });
});

describe("logout (proxy mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn().mockResolvedValue(new Response("{}"));
    // biome-ignore lint/suspicious/noExplicitAny: test mock -- need to assign mock to globalThis.fetch
    globalThis.fetch = mockFetch as any;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls /logout on the proxy", async () => {
    const session = mockSession();
    await logout(session);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3100/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not throw if /logout fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const session = mockSession();
    await expect(logout(session)).resolves.toBeUndefined();
  });

  it("does nothing if no proxy configured", async () => {
    (getProxyUrl as Mock).mockReturnValueOnce(null);
    const session = mockSession();
    await logout(session);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
