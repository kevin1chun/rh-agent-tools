/** Redact sensitive tokens from strings before they reach the LLM. */

const REDACTED = "[REDACTED]";

// Matches JWT-shaped strings: three dot-separated base64url segments, each 20+ chars.
// All JWTs start with eyJ (base64url of '{"').
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g;

// Matches values of known sensitive keys in JSON-serialized strings.
// e.g. "access_token":"some-value" → "access_token":"[REDACTED]"
const SENSITIVE_KEY_PATTERN =
  /"(access_token|refresh_token|device_token|bearer_token|authorization)":\s*"([^"]*)"/gi;

/** Redact JWT tokens and known sensitive key values from a string. */
export function redactTokens(input: string): string {
  let result = input;
  result = result.replace(SENSITIVE_KEY_PATTERN, `"$1":"${REDACTED}"`);
  result = result.replace(JWT_PATTERN, REDACTED);
  return result;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "device_token",
  "bearer_token",
  "token",
]);

/** Recursively scrub a single value (object, array, or primitive). */
function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (typeof value === "object" && value !== null) {
    return scrubSensitiveKeys(value as Record<string, unknown>);
  }
  return value;
}

/** Deep-clone an object, replacing known sensitive key values with [REDACTED]. */
export function scrubSensitiveKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      scrubbed[key] = REDACTED;
    } else {
      scrubbed[key] = scrubValue(value);
    }
  }
  return scrubbed;
}
