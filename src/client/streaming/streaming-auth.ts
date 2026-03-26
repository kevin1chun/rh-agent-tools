/** Streaming token lifecycle — fetches and caches the dxLink auth token. */

import type { RobinhoodSession } from "../session.js";
import { marketdataToken } from "../urls.js";
import { StreamingAuthError } from "./errors.js";
import { type StreamingTokenData, StreamingTokenResponseSchema } from "./types.js";

/** Refresh at 80% of TTL to avoid edge-of-expiry failures. */
const REFRESH_RATIO = 0.8;

export class StreamingAuth {
  private cached: StreamingTokenData | null = null;
  private expiresAt = 0;

  constructor(private session: RobinhoodSession) {}

  /** Return a valid streaming token, fetching/refreshing as needed. */
  async ensureToken(): Promise<StreamingTokenData> {
    if (this.cached && Date.now() < this.expiresAt) {
      return this.cached;
    }
    return this.fetchToken();
  }

  /** Force-fetch a new streaming token. */
  async fetchToken(): Promise<StreamingTokenData> {
    const sessionId = crypto.randomUUID();
    const url = marketdataToken();
    const params = {
      session_id: sessionId,
      session_type: "blackwidow",
    };

    const response = await this.session.get(url, params);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new StreamingAuthError(
        `Streaming token request failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
      );
    }

    const json = await response.json();
    const parsed = StreamingTokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new StreamingAuthError(`Unexpected streaming token response: ${parsed.error.message}`);
    }

    const data = parsed.data.data.data;
    this.cached = data;
    const ttlMs = Number.parseInt(data.ttl_ms, 10);
    this.expiresAt = Date.now() + ttlMs * REFRESH_RATIO;
    return data;
  }

  /** Invalidate the cached token (e.g. on auth failure). */
  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
  }
}
