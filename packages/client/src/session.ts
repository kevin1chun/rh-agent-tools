/** HTTP session wrapper for Robinhood API using native fetch. */

export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "*/*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=1",
  "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
  "X-Robinhood-API-Version": "1.431.4",
  "User-Agent": "rh-for-agents/0.1.0",
};

const DEFAULT_TIMEOUT_MS = 16_000;

export class RobinhoodSession {
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(opts?: { timeoutMs?: number }) {
    this.headers = { ...DEFAULT_HEADERS };
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  setAuth(token: string): void {
    this.headers.Authorization = `Bearer ${token}`;
  }

  clearAuth(): void {
    delete this.headers.Authorization;
  }

  getAuthToken(): string | undefined {
    const auth = this.headers.Authorization;
    return auth?.replace("Bearer ", "");
  }

  async get(url: string, params?: Record<string, string>): Promise<Response> {
    const target = params ? `${url}?${new URLSearchParams(params)}` : url;
    return fetch(target, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "follow",
    });
  }

  async post(
    url: string,
    body?: Record<string, unknown>,
    opts?: { asJson?: boolean; timeoutMs?: number },
  ): Promise<Response> {
    const timeout = opts?.timeoutMs ?? this.timeoutMs;
    const headers = { ...this.headers };

    let requestBody: string;
    if (opts?.asJson) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body ?? {});
    } else {
      for (const [k, v] of Object.entries(body ?? {})) {
        if (v !== null && typeof v === "object") {
          throw new Error(
            `Cannot form-encode nested object at key "${k}". Use asJson: true for complex payloads.`,
          );
        }
      }
      requestBody = new URLSearchParams(
        Object.entries(body ?? {}).map(([k, v]) => [k, String(v)]),
      ).toString();
    }

    return fetch(url, {
      method: "POST",
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });
  }

  async delete(url: string): Promise<Response> {
    return fetch(url, {
      method: "DELETE",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "follow",
    });
  }
}

export function createSession(opts?: { timeoutMs?: number }): RobinhoodSession {
  return new RobinhoodSession(opts);
}
