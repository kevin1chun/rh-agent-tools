"""Redact sensitive tokens from strings before they reach the LLM."""

import re
from typing import Any

_REDACTED = "[REDACTED]"

# Matches JWT-shaped strings: three dot-separated base64url segments, each 20+ chars.
_JWT_PATTERN = re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b")

# Matches "Authorization: Bearer <token>" in plain-text headers/logs.
_BEARER_HEADER_PATTERN = re.compile(r"\bBearer\s+[A-Za-z0-9_.-]{10,}\b", re.IGNORECASE)

# Matches values of known sensitive keys in JSON-serialized strings.
_SENSITIVE_KEY_PATTERN = re.compile(
    r'"(access_token|refresh_token|device_token|bearer_token|authorization'
    r'|password|secret|account_number)":\s*"([^"]*)"',
    re.IGNORECASE,
)

_SENSITIVE_KEYS = frozenset(
    {
        "access_token",
        "refresh_token",
        "device_token",
        "bearer_token",
        "token",
        "password",
        "secret",
        "account_number",
    }
)


def redact_tokens(input_str: str) -> str:
    """Redact JWT tokens and known sensitive key values from a string."""
    result = _SENSITIVE_KEY_PATTERN.sub(rf'"\1":"{_REDACTED}"', input_str)
    result = _JWT_PATTERN.sub(_REDACTED, result)
    result = _BEARER_HEADER_PATTERN.sub(f"Bearer {_REDACTED}", result)
    return result


def scrub_sensitive_keys(obj: dict[str, Any]) -> dict[str, Any]:
    """Deep-clone an object, replacing known sensitive key values with [REDACTED]."""
    scrubbed: dict[str, Any] = {}
    for key, value in obj.items():
        if key in _SENSITIVE_KEYS:
            scrubbed[key] = _REDACTED
        elif isinstance(value, dict):
            scrubbed[key] = scrub_sensitive_keys(value)
        elif isinstance(value, list):
            scrubbed[key] = [
                scrub_sensitive_keys(item) if isinstance(item, dict) else item for item in value
            ]
        else:
            scrubbed[key] = value
    return scrubbed
