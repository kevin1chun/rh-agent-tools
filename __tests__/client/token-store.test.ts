import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTokens, loadTokens, saveTokens } from "../../src/client/token-store.js";

const sampleTokens = {
  access_token: "tok123",
  refresh_token: "ref456",
  token_type: "Bearer",
  device_token: "dev789",
  account_hint: "",
};

// Mock Bun.secrets at the global level
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

// biome-ignore lint/suspicious/noExplicitAny: test mock
(globalThis as any).Bun = { ...((globalThis as any).Bun ?? {}), secrets: mockSecrets };

describe("token-store", () => {
  const origEnv = process.env.ROBINHOOD_TOKENS_FILE;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretsStore.clear();
    delete process.env.ROBINHOOD_TOKENS_FILE;
  });

  afterEach(() => {
    if (origEnv !== undefined) process.env.ROBINHOOD_TOKENS_FILE = origEnv;
    else delete process.env.ROBINHOOD_TOKENS_FILE;
    vi.restoreAllMocks();
  });

  describe("saveTokens", () => {
    it("stores tokens in Bun.secrets", async () => {
      const result = await saveTokens(sampleTokens);

      expect(result).toBe("keychain");
      expect(mockSecrets.set).toHaveBeenCalledWith(
        "robinhood-for-agents",
        "session-tokens",
        expect.any(String),
      );

      const stored = mockSecretsStore.get("robinhood-for-agents:session-tokens");
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored ?? "");
      expect(parsed.access_token).toBe("tok123");
      expect(parsed.refresh_token).toBe("ref456");
      expect(parsed.saved_at).toBeTypeOf("number");
    });

    it("does not throw when Bun.secrets is unavailable (e.g. Docker)", async () => {
      mockSecrets.set.mockRejectedValueOnce(new Error("unavailable"));
      const result = await saveTokens(sampleTokens);
      expect(result).toBe("keychain");
    });
  });

  describe("loadTokens", () => {
    it("loads tokens from Bun.secrets", async () => {
      await saveTokens(sampleTokens);
      const result = await loadTokens();

      expect(result).not.toBeNull();
      expect(result?.access_token).toBe("tok123");
      expect(result?.device_token).toBe("dev789");
    });

    it("returns null when no tokens stored", async () => {
      const result = await loadTokens();
      expect(result).toBeNull();
    });

    it("returns null for invalid JSON in keychain", async () => {
      mockSecretsStore.set("robinhood-for-agents:session-tokens", "not json");
      const result = await loadTokens();
      expect(result).toBeNull();
    });

    it("returns null for JSON without access_token", async () => {
      mockSecretsStore.set("robinhood-for-agents:session-tokens", JSON.stringify({ foo: "bar" }));
      const result = await loadTokens();
      expect(result).toBeNull();
    });

    it("returns null when Bun.secrets throws", async () => {
      mockSecrets.get.mockRejectedValueOnce(new Error("keychain locked"));
      const result = await loadTokens();
      expect(result).toBeNull();
    });
  });

  describe("deleteTokens", () => {
    it("deletes from keychain", async () => {
      mockSecretsStore.set("robinhood-for-agents:session-tokens", "data");

      await deleteTokens();

      expect(mockSecrets.delete).toHaveBeenCalledWith({
        service: "robinhood-for-agents",
        name: "session-tokens",
      });
    });

    it("does not throw when nothing to delete", async () => {
      await expect(deleteTokens()).resolves.toBeUndefined();
    });
  });

  describe("ROBINHOOD_TOKENS_FILE", () => {
    it("loadTokens reads from file when env set", async () => {
      const dir = mkdtempSync(join(tmpdir(), "rh-tokens-test-"));
      const filePath = join(dir, "tokens.json");
      const tokenData = {
        ...sampleTokens,
        saved_at: Date.now() / 1000,
      };
      writeFileSync(filePath, JSON.stringify(tokenData));
      process.env.ROBINHOOD_TOKENS_FILE = filePath;

      try {
        const result = await loadTokens();
        expect(result).not.toBeNull();
        expect(result?.access_token).toBe("tok123");
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it("saveTokens writes to file when env set", async () => {
      const dir = mkdtempSync(join(tmpdir(), "rh-tokens-test-"));
      const filePath = join(dir, "tokens.json");
      process.env.ROBINHOOD_TOKENS_FILE = filePath;

      try {
        const result = await saveTokens(sampleTokens);
        expect(result).toBe(filePath);
        const { readFileSync } = await import("node:fs");
        const content = JSON.parse(readFileSync(filePath, "utf8"));
        expect(content.access_token).toBe("tok123");
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });
});
