/**
 * Token storage using OS keychain via Bun.secrets.
 *
 * Tokens are stored as JSON in the OS keychain (macOS Keychain Services,
 * Linux libsecret, Windows Credential Manager). When ROBINHOOD_TOKENS_FILE
 * is set (e.g. in Docker), tokens are read from and written to that file
 * so the host can mount a file exported from the keychain.
 */

const KEYRING_SERVICE = "robinhood-for-agents";
const KEYRING_NAME = "session-tokens";

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  device_token: string;
  account_hint?: string;
  saved_at: number;
}

function isTokenData(data: unknown): data is TokenData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.access_token === "string" &&
    typeof obj.refresh_token === "string" &&
    typeof obj.token_type === "string" &&
    typeof obj.device_token === "string" &&
    typeof obj.saved_at === "number"
  );
}

function getTokensFilePath(): string | undefined {
  return process.env.ROBINHOOD_TOKENS_FILE?.trim() || undefined;
}

async function loadTokensFromFile(path: string): Promise<TokenData | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const json = await readFile(path, "utf8");
    const data: unknown = JSON.parse(json);
    return isTokenData(data) ? data : null;
  } catch {
    return null;
  }
}

async function loadTokensFromKeychain(): Promise<TokenData | null> {
  try {
    const json = await Bun.secrets.get(KEYRING_SERVICE, KEYRING_NAME);
    if (json) {
      const data: unknown = JSON.parse(json);
      if (isTokenData(data)) return data;
    }
  } catch {
    // Bun.secrets unavailable or keychain access denied
  }
  return null;
}

export async function saveTokens(tokens: Omit<TokenData, "saved_at">): Promise<string> {
  const data: TokenData = { ...tokens, saved_at: Date.now() / 1000 };
  const json = JSON.stringify(data);

  const filePath = getTokensFilePath();
  try {
    await Bun.secrets.set(KEYRING_SERVICE, KEYRING_NAME, json);
  } catch {
    // Keychain unavailable (e.g. Docker without keychain)
  }
  if (filePath) {
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, json, "utf8");
    } catch {
      // Ignore write errors (e.g. read-only mount)
    }
  }
  return filePath ?? "keychain";
}

export async function loadTokens(): Promise<TokenData | null> {
  const filePath = getTokensFilePath();
  if (filePath) {
    const fromFile = await loadTokensFromFile(filePath);
    if (fromFile) return fromFile;
  }
  return loadTokensFromKeychain();
}

// ---------------------------------------------------------------------------
// Proxy token — per-session shared secret for proxy access control
// ---------------------------------------------------------------------------

const PROXY_TOKEN_NAME = "proxy-token";

export async function saveProxyToken(token: string): Promise<void> {
  try {
    await Bun.secrets.set(KEYRING_SERVICE, PROXY_TOKEN_NAME, token);
  } catch {
    // Keychain unavailable (e.g. Docker without keychain)
  }
}

export async function loadProxyToken(): Promise<string | null> {
  try {
    return (await Bun.secrets.get(KEYRING_SERVICE, PROXY_TOKEN_NAME)) ?? null;
  } catch {
    return null;
  }
}

export async function deleteProxyToken(): Promise<void> {
  try {
    await Bun.secrets.delete({ service: KEYRING_SERVICE, name: PROXY_TOKEN_NAME });
  } catch {
    // Bun.secrets unavailable
  }
}

export async function deleteTokens(): Promise<void> {
  try {
    await Bun.secrets.delete({ service: KEYRING_SERVICE, name: KEYRING_NAME });
  } catch {
    // Bun.secrets unavailable
  }
  const filePath = getTokensFilePath();
  if (filePath) {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
    } catch {
      // File missing or not writable
    }
  }
}
