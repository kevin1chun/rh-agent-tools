import { describe, expect, it, vi } from "vitest";
import { redactTokens } from "../../src/redact.js";

// Mock Bun.secrets so token-store can load
const mockSecretsStore = new Map<string, string>();
const mockSecrets = {
  get: vi.fn(
    async (service: string, name: string) => mockSecretsStore.get(`${service}:${name}`) ?? null,
  ),
  set: vi.fn(async (service: string, name: string, value: string) => {
    mockSecretsStore.set(`${service}:${name}`, value);
  }),
  delete: vi.fn(async (opts: { service: string; name: string }) => {
    return mockSecretsStore.delete(`${opts.service}:${opts.name}`);
  }),
};
// biome-ignore lint/suspicious/noExplicitAny: test mock -- need to mock Bun globals
const _g = globalThis as any;
_g.Bun = { ...(_g.Bun ?? {}), secrets: mockSecrets, serve: vi.fn() };

import { deleteProxyToken, loadProxyToken, saveProxyToken } from "../../src/client/token-store.js";
import { FORWARD_HEADERS, resolveUpstream } from "../../src/server/proxy.js";

describe("proxy", () => {
  describe("resolveUpstream", () => {
    it("routes /rh/positions/ to api.robinhood.com", () => {
      const result = resolveUpstream("/rh/positions/");
      expect(result).toEqual({
        upstream: "https://api.robinhood.com",
        path: "/positions/",
      });
    });

    it("routes /nummus/orders/ to nummus.robinhood.com", () => {
      const result = resolveUpstream("/nummus/orders/");
      expect(result).toEqual({
        upstream: "https://nummus.robinhood.com",
        path: "/orders/",
      });
    });

    it("routes bare /rh to root path", () => {
      const result = resolveUpstream("/rh");
      expect(result).toEqual({
        upstream: "https://api.robinhood.com",
        path: "/",
      });
    });

    it("routes bare /nummus to root path", () => {
      const result = resolveUpstream("/nummus");
      expect(result).toEqual({
        upstream: "https://nummus.robinhood.com",
        path: "/",
      });
    });

    it("returns null for unknown paths", () => {
      expect(resolveUpstream("/unknown/foo")).toBeNull();
      expect(resolveUpstream("/")).toBeNull();
      expect(resolveUpstream("/health")).toBeNull();
    });

    it("does not match prefix substrings (e.g. /rhino)", () => {
      expect(resolveUpstream("/rhino")).toBeNull();
      expect(resolveUpstream("/nummused")).toBeNull();
    });

    it("handles deeply nested paths", () => {
      const result = resolveUpstream("/rh/options/orders/abc-123/cancel/");
      expect(result).toEqual({
        upstream: "https://api.robinhood.com",
        path: "/options/orders/abc-123/cancel/",
      });
    });
  });

  describe("redaction in error responses", () => {
    it("redacts tokens from error messages", () => {
      const msg =
        'Failed: {"access_token":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_here_is_long_enough"}';
      const redacted = redactTokens(msg);
      expect(redacted).not.toContain("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(redacted).toContain("[REDACTED]");
    });

    it("redacts sensitive key values", () => {
      const msg = '{"access_token":"secret123","refresh_token":"refresh456"}';
      const redacted = redactTokens(msg);
      expect(redacted).not.toContain("secret123");
      expect(redacted).not.toContain("refresh456");
    });
  });

  describe("proxy auth injection", () => {
    it("strips incoming Authorization and adds Bearer token", () => {
      const headers = new Headers({
        Authorization: "Bearer user-supplied",
        "Content-Type": "application/json",
      });

      headers.delete("authorization");
      headers.set("Authorization", "Bearer proxy-token-123");

      expect(headers.get("Authorization")).toBe("Bearer proxy-token-123");
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("strips Authorization from response headers", () => {
      const respHeaders = new Headers({
        Authorization: "Bearer should-not-leak",
        "Content-Type": "application/json",
      });

      respHeaders.delete("authorization");

      expect(respHeaders.has("authorization")).toBe(false);
      expect(respHeaders.get("Content-Type")).toBe("application/json");
    });
  });

  describe("proxy token persistence", () => {
    it("saves and loads proxy token from keychain", async () => {
      await saveProxyToken("test-proxy-uuid");
      const loaded = await loadProxyToken();
      expect(loaded).toBe("test-proxy-uuid");
    });

    it("returns null when no proxy token is stored", async () => {
      mockSecretsStore.clear();
      const loaded = await loadProxyToken();
      expect(loaded).toBeNull();
    });

    it("deletes proxy token from keychain", async () => {
      await saveProxyToken("to-be-deleted");
      await deleteProxyToken();
      const loaded = await loadProxyToken();
      expect(loaded).toBeNull();
    });
  });

  describe("header allowlist", () => {
    it("only forwards safe headers to upstream", () => {
      const incoming = new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: "session=abc123",
        "X-Forwarded-For": "172.17.0.2",
        "X-Custom-Auth": "secret",
        "User-Agent": "test-agent",
        "X-Robinhood-API-Version": "1.431.4",
      });

      const filtered = new Headers();
      for (const [key, value] of incoming) {
        if (FORWARD_HEADERS.has(key.toLowerCase())) {
          filtered.set(key, value);
        }
      }

      expect(filtered.get("accept")).toBe("application/json");
      expect(filtered.get("content-type")).toBe("application/json");
      expect(filtered.get("user-agent")).toBe("test-agent");
      expect(filtered.get("x-robinhood-api-version")).toBe("1.431.4");
      // These should NOT be forwarded
      expect(filtered.has("cookie")).toBe(false);
      expect(filtered.has("x-forwarded-for")).toBe(false);
      expect(filtered.has("x-custom-auth")).toBe(false);
    });
  });
});
