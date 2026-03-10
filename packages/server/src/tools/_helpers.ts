/** Shared helpers for MCP tool handlers. */

import { getClient } from "@investwithtaji/rh-client";

export function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function textError(msg: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
    isError: true as const,
  };
}

export function getRh() {
  return getClient();
}

export async function getAuthenticatedRh() {
  const rh = getClient();
  if (!rh.isLoggedIn) {
    await rh.restoreSession();
  }
  return rh;
}
