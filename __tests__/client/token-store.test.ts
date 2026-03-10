import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs and node:fs/promises before importing the module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  chmod: vi.fn().mockResolvedValue(undefined),
}));

// Mock keytar as unavailable by default
vi.mock("keytar", () => {
  throw new Error("keytar not available");
});

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { Mock } from "vitest";
import { deleteTokens, loadTokens, saveTokens } from "../../src/client/token-store.js";

const mockExistsSync = existsSync as Mock;
const mockReadFileSync = readFileSync as Mock;
const mockWriteFileSync = writeFileSync as Mock;
const mockUnlinkSync = unlinkSync as Mock;

describe("token-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveTokens", () => {
    it("writes plaintext JSON when keytar is unavailable", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await saveTokens({
        access_token: "tok123",
        refresh_token: "ref456",
        token_type: "Bearer",
        device_token: "dev789",
        account_hint: "",
      });

      expect(mkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();

      // Verify the written data is valid JSON with our tokens
      const writtenData = mockWriteFileSync.mock.calls[0]?.[1];
      expect(writtenData).toBeInstanceOf(Buffer);
      const parsed = JSON.parse(writtenData.toString());
      expect(parsed.access_token).toBe("tok123");
      expect(parsed.refresh_token).toBe("ref456");
      expect(parsed.saved_at).toBeTypeOf("number");

      // Should warn about plaintext fallback
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("keytar unavailable"));
    });
  });

  describe("loadTokens", () => {
    it("returns null when token file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await loadTokens();
      expect(result).toBeNull();
    });

    it("loads plaintext JSON tokens", async () => {
      const tokenData = {
        access_token: "tok",
        refresh_token: "ref",
        token_type: "Bearer",
        device_token: "dev",
        saved_at: Date.now() / 1000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from(JSON.stringify(tokenData)));

      const result = await loadTokens();
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe("tok");
      expect(result?.device_token).toBe("dev");
    });

    it("returns null for corrupt data", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from("not json"));

      const result = await loadTokens();
      expect(result).toBeNull();
    });

    it("returns null for JSON without access_token", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from(JSON.stringify({ foo: "bar" })));

      const result = await loadTokens();
      expect(result).toBeNull();
    });
  });

  describe("deleteTokens", () => {
    it("deletes file when it exists", () => {
      mockExistsSync.mockReturnValue(true);
      deleteTokens();
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it("does nothing when file does not exist", () => {
      mockExistsSync.mockReturnValue(false);
      deleteTokens();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});
