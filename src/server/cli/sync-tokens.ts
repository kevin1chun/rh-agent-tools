/**
 * sync-tokens: write tokens to a file once or on an interval (for Docker bind-mount).
 */

import { resolve } from "node:path";
import { writeTokensToFile } from "./token-export.js";

function parseArgs(argv: string[]): { outPath: string; intervalSec: number | null } {
  let outPath = "";
  let intervalSec: number | null = null;
  const outIdx = argv.findIndex((a) => a === "--out" || a === "-o");
  const outVal = outIdx !== -1 ? argv[outIdx + 1] : undefined;
  if (outVal) outPath = resolve(outVal);
  const intervalIdx = argv.findIndex((a) => a === "--interval" || a === "-i");
  const intervalVal = intervalIdx !== -1 ? argv[intervalIdx + 1] : undefined;
  if (intervalVal) {
    const n = Number.parseInt(intervalVal, 10);
    if (Number.isFinite(n) && n > 0) intervalSec = n;
  }
  return { outPath, intervalSec };
}

export async function runSyncTokens(argv: string[]): Promise<void> {
  const { outPath, intervalSec } = parseArgs(argv);
  if (!outPath) {
    console.error("Usage: robinhood-for-agents sync-tokens --out <path> [--interval <sec>]");
    process.exit(1);
  }

  const ok = await writeTokensToFile(outPath);
  if (!ok) {
    console.error("Not logged in. Run robinhood-for-agents login first.");
    process.exit(1);
  }

  if (intervalSec === null) {
    console.log(`Tokens written to ${outPath}`);
    return;
  }

  console.log(`Syncing to ${outPath} every ${intervalSec}s (Ctrl+C to stop).`);
  for (;;) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    await writeTokensToFile(outPath);
  }
}
