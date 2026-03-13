/** Shared helpers for MCP tool handlers. */

import { getClient } from "../../client/index.js";
import { redactTokens } from "../../redact.js";

export function text(data: unknown) {
  return { content: [{ type: "text" as const, text: redactTokens(JSON.stringify(data)) }] };
}

export function textError(msg: string) {
  return {
    content: [{ type: "text" as const, text: redactTokens(JSON.stringify({ error: msg })) }],
    isError: true as const,
  };
}

export function getRh() {
  return getClient();
}

/** Returns a short account hint (e.g. "...4521") for display. */
export async function getAccountHint(rh: {
  getAccountProfile(): Promise<{ account_number?: string }>;
}): Promise<string> {
  try {
    const profile = await rh.getAccountProfile();
    const acct = profile.account_number ?? "";
    return acct.length >= 4 ? `...${acct.slice(-4)}` : acct;
  } catch {
    return "";
  }
}

export async function getAuthenticatedRh() {
  const rh = getClient();
  if (!rh.isLoggedIn) {
    await rh.restoreSession();
  }
  return rh;
}
