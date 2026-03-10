import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError } from "../../src/client/errors.js";

// Mock token-store
vi.mock("../../src/client/token-store.js", () => ({
  loadTokens: vi.fn().mockResolvedValue(null),
  saveTokens: vi.fn().mockResolvedValue("/tmp/session.enc"),
  deleteTokens: vi.fn(),
}));

import type { Mock } from "vitest";
import { logout, restoreSession } from "../../src/client/auth.js";
import type { RobinhoodSession } from "../../src/client/session.js";
import { deleteTokens, loadTokens, saveTokens } from "../../src/client/token-store.js";

const mockLoadTokens = loadTokens as Mock;
const mockSaveTokens = saveTokens as Mock;

function mockSession(): RobinhoodSession {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    getAuthToken: vi.fn(),
  } as unknown as RobinhoodSession;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("restoreSession", () => {
  let session: RobinhoodSession;

  beforeEach(() => {
    vi.clearAllMocks();
    session = mockSession();
    mockLoadTokens.mockResolvedValue(null);
  });

  it("uses cached token when valid", async () => {
    mockLoadTokens.mockResolvedValue({
      access_token: "cached-tok",
      refresh_token: "cached-ref",
      device_token: "cached-dev",
    });
    // validateToken: positions call succeeds
    (session.get as Mock).mockResolvedValueOnce(jsonResponse([], 200));

    const result = await restoreSession(session);

    expect(result.method).toBe("cached");
    expect(result.device_token).toBe("cached-dev");
    expect(session.setAuth).toHaveBeenCalledWith("cached-tok");
  });

  it("refreshes token when cached token is invalid", async () => {
    mockLoadTokens.mockResolvedValue({
      access_token: "expired-tok",
      refresh_token: "ref-tok",
      device_token: "dev",
    });
    // validateToken fails
    (session.get as Mock).mockResolvedValueOnce(jsonResponse({}, 401));
    // Refresh succeeds
    (session.post as Mock).mockResolvedValueOnce(
      jsonResponse({
        access_token: "new-tok",
        refresh_token: "new-ref",
        token_type: "Bearer",
      }),
    );

    const result = await restoreSession(session);

    expect(result.method).toBe("refreshed");
    expect(session.clearAuth).toHaveBeenCalled();
    expect(session.setAuth).toHaveBeenCalledWith("new-tok");
    expect(mockSaveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "new-tok" }),
    );
  });

  it("throws AuthenticationError when no cached session", async () => {
    mockLoadTokens.mockResolvedValue(null);

    await expect(restoreSession(session)).rejects.toThrow(AuthenticationError);
    await expect(restoreSession(session)).rejects.toThrow("robinhood_browser_login");
  });

  it("throws AuthenticationError when token invalid and refresh fails", async () => {
    mockLoadTokens.mockResolvedValue({
      access_token: "expired-tok",
      refresh_token: "ref-tok",
      device_token: "dev",
    });
    // validateToken fails
    (session.get as Mock).mockResolvedValueOnce(jsonResponse({}, 401));
    // Refresh fails
    (session.post as Mock).mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(restoreSession(session)).rejects.toThrow(AuthenticationError);
    await expect(restoreSession(session)).rejects.toThrow("robinhood_browser_login");
  });

  it("throws AuthenticationError when token invalid and no refresh token", async () => {
    mockLoadTokens.mockResolvedValue({
      access_token: "expired-tok",
      refresh_token: "",
      device_token: "dev",
    });
    // validateToken fails
    (session.get as Mock).mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(restoreSession(session)).rejects.toThrow(AuthenticationError);
  });
});

describe("logout", () => {
  it("revokes token and clears session", async () => {
    const session = mockSession();
    (session.getAuthToken as Mock).mockReturnValue("tok123");
    (session.post as Mock).mockResolvedValueOnce(jsonResponse({}));

    await logout(session);

    expect(session.post).toHaveBeenCalled();
    expect(session.clearAuth).toHaveBeenCalled();
    expect(deleteTokens).toHaveBeenCalled();
  });

  it("clears session even if revoke fails", async () => {
    const session = mockSession();
    (session.getAuthToken as Mock).mockReturnValue("tok123");
    (session.post as Mock).mockRejectedValueOnce(new Error("network error"));

    await logout(session);

    expect(session.clearAuth).toHaveBeenCalled();
    expect(deleteTokens).toHaveBeenCalled();
  });
});
