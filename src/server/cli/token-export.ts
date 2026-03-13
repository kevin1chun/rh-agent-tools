/**
 * Shared: load tokens and write JSON to a path. Used by docker-setup and sync-tokens.
 * Always chmod 600 after write so the file is not world-readable.
 */

import { chmod, writeFile } from "node:fs/promises";
import { loadTokens } from "../../client/token-store.js";

/** Write current tokens to path (and chmod 600). Returns true if tokens existed and were written. */
export async function writeTokensToFile(absPath: string): Promise<boolean> {
  const tokens = await loadTokens();
  if (!tokens) return false;
  const json = JSON.stringify(tokens, null, 0);
  await writeFile(absPath, json, "utf8");
  try {
    await chmod(absPath, 0o600);
  } catch {
    // Ignore on Windows or if not supported
  }
  return true;
}
