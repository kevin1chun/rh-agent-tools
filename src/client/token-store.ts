/**
 * Encrypted token storage using AES-256-GCM with OS keychain key management.
 *
 * Tokens are stored as encrypted JSON at ~/.rh-for-agents/session.enc.
 * The encryption key is stored in the OS keychain via keytar,
 * so it never touches the filesystem.
 *
 * Falls back to plaintext JSON with a warning if keytar/crypto
 * are unavailable (e.g. in CI or minimal environments).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_DIR = join(homedir(), ".rh-for-agents");
const TOKEN_FILE = join(TOKEN_DIR, "session.enc");
const KEYRING_SERVICE = "rh-for-agents";
const KEYRING_USERNAME = "encryption-key";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  device_token: string;
  account_hint?: string;
  saved_at: number;
}

// Dynamic keytar import (optional dep)
interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
}

async function loadKeytar(): Promise<Keytar | null> {
  try {
    return (await import("keytar")) as Keytar;
  } catch {
    return null;
  }
}

async function getOrCreateKey(): Promise<Buffer | null> {
  const keytar = await loadKeytar();
  if (!keytar) return null;

  const existing = await keytar.getPassword(KEYRING_SERVICE, KEYRING_USERNAME);
  if (existing) {
    return Buffer.from(existing, "hex");
  }

  const key = randomBytes(KEY_LENGTH);
  await keytar.setPassword(KEYRING_SERVICE, KEYRING_USERNAME, key.toString("hex"));
  return key;
}

function encrypt(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: [iv (12)] [tag (16)] [ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(data: Buffer, key: Buffer): Buffer {
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function saveTokens(tokens: Omit<TokenData, "saved_at">): Promise<string> {
  const data: TokenData = { ...tokens, saved_at: Date.now() / 1000 };
  const payload = Buffer.from(JSON.stringify(data));

  mkdirSync(TOKEN_DIR, { recursive: true });

  const key = await getOrCreateKey();
  if (key) {
    writeFileSync(TOKEN_FILE, encrypt(payload, key));
  } else {
    // Fallback: plaintext JSON
    console.warn("[rh-for-agents] keytar unavailable — saving tokens as plaintext JSON");
    writeFileSync(TOKEN_FILE, payload);
  }

  await chmod(TOKEN_FILE, 0o600);
  return TOKEN_FILE;
}

export async function loadTokens(): Promise<TokenData | null> {
  if (!existsSync(TOKEN_FILE)) return null;

  const raw = readFileSync(TOKEN_FILE);

  try {
    const key = await getOrCreateKey();
    let data: unknown;
    if (key) {
      const decrypted = decrypt(raw, key);
      data = JSON.parse(decrypted.toString());
    } else {
      // Try plaintext JSON fallback
      data = JSON.parse(raw.toString());
    }

    if (typeof data === "object" && data !== null && "access_token" in data) {
      return data as TokenData;
    }
    return null;
  } catch {
    return null;
  }
}

export function deleteTokens(): void {
  if (existsSync(TOKEN_FILE)) {
    unlinkSync(TOKEN_FILE);
  }
}
