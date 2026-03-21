import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTokenStore,
  EncryptedFileTokenStore,
  KeychainTokenStore,
  type TokenData,
} from "../../src/client/token-store.js";

const sampleTokens: TokenData = {
  access_token: "tok123",
  refresh_token: "ref456",
  token_type: "Bearer",
  device_token: "dev789",
  saved_at: Date.now() / 1000,
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

describe("KeychainTokenStore", () => {
  const store = new KeychainTokenStore();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretsStore.clear();
  });

  it("save stores tokens in Bun.secrets", async () => {
    await store.save(sampleTokens);

    expect(mockSecrets.set).toHaveBeenCalledWith(
      "robinhood-for-agents",
      "session-tokens",
      expect.any(String),
    );

    const stored = mockSecretsStore.get("robinhood-for-agents:session-tokens");
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored ?? "");
    expect(parsed.access_token).toBe("tok123");
  });

  it("load returns tokens from Bun.secrets", async () => {
    await store.save(sampleTokens);
    const result = await store.load();
    expect(result?.access_token).toBe("tok123");
    expect(result?.device_token).toBe("dev789");
  });

  it("load returns null when no tokens stored", async () => {
    expect(await store.load()).toBeNull();
  });

  it("load returns null for invalid JSON", async () => {
    mockSecretsStore.set("robinhood-for-agents:session-tokens", "not json");
    expect(await store.load()).toBeNull();
  });

  it("load returns null when Bun.secrets throws", async () => {
    mockSecrets.get.mockRejectedValueOnce(new Error("keychain locked"));
    expect(await store.load()).toBeNull();
  });

  it("delete calls Bun.secrets.delete", async () => {
    await store.delete();
    expect(mockSecrets.delete).toHaveBeenCalledWith({
      service: "robinhood-for-agents",
      name: "session-tokens",
    });
  });
});

describe("EncryptedFileTokenStore", () => {
  let dir: string;
  let filePath: string;
  const origEnv = process.env.ROBINHOOD_TOKEN_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretsStore.clear();
    dir = mkdtempSync(join(tmpdir(), "rh-enc-test-"));
    filePath = join(dir, "tokens.enc");
    // Set a test encryption key (32 bytes base64)
    process.env.ROBINHOOD_TOKEN_KEY = Buffer.from("01234567890123456789012345678901").toString(
      "base64",
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (origEnv !== undefined) process.env.ROBINHOOD_TOKEN_KEY = origEnv;
    else delete process.env.ROBINHOOD_TOKEN_KEY;
  });

  it("save + load round-trips tokens", async () => {
    const store = new EncryptedFileTokenStore(filePath);
    await store.save(sampleTokens);

    const loaded = await store.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.access_token).toBe("tok123");
    expect(loaded?.refresh_token).toBe("ref456");
    expect(loaded?.device_token).toBe("dev789");
  });

  it("file contains encrypted blob, not plaintext", async () => {
    const store = new EncryptedFileTokenStore(filePath);
    await store.save(sampleTokens);

    const content = readFileSync(filePath, "utf8");
    expect(content).not.toContain("tok123");
    const blob = JSON.parse(content);
    expect(blob.iv).toBeDefined();
    expect(blob.tag).toBeDefined();
    expect(blob.ciphertext).toBeDefined();
  });

  it("load returns null for missing file", async () => {
    const store = new EncryptedFileTokenStore(join(dir, "nonexistent.enc"));
    expect(await store.load()).toBeNull();
  });

  it("load returns null for corrupted file", async () => {
    writeFileSync(filePath, "not json");
    const store = new EncryptedFileTokenStore(filePath);
    expect(await store.load()).toBeNull();
  });

  it("delete removes the file", async () => {
    const store = new EncryptedFileTokenStore(filePath);
    await store.save(sampleTokens);
    await store.delete();
    expect(await store.load()).toBeNull();
  });
});

describe("createTokenStore", () => {
  const origEnv = process.env.ROBINHOOD_TOKENS_FILE;

  afterEach(() => {
    if (origEnv !== undefined) process.env.ROBINHOOD_TOKENS_FILE = origEnv;
    else delete process.env.ROBINHOOD_TOKENS_FILE;
  });

  it("returns KeychainTokenStore by default", () => {
    delete process.env.ROBINHOOD_TOKENS_FILE;
    const store = createTokenStore();
    expect(store).toBeInstanceOf(KeychainTokenStore);
  });

  it("returns EncryptedFileTokenStore when ROBINHOOD_TOKENS_FILE is set", () => {
    process.env.ROBINHOOD_TOKENS_FILE = "/tmp/test-tokens.enc";
    const store = createTokenStore();
    expect(store).toBeInstanceOf(EncryptedFileTokenStore);
  });
});
