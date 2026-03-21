"""HTTP request helpers with pagination and dataType handling."""

import json
from typing import Any
from urllib.parse import urlparse

from ._errors import APIError, NotFoundError, RateLimitError
from ._redact import redact_tokens, scrub_sensitive_keys
from ._session import Session
from ._types import DataType
from ._urls import trusted_origins


def _assert_trusted_url(url: str) -> None:
    """Reject URLs that point outside trusted Robinhood domains."""
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in trusted_origins():
        raise APIError(f"Refusing to follow URL to untrusted host: {parsed.hostname}")


async def request_get(
    session: Session,
    url: str,
    *,
    data_type: DataType = "regular",
    params: dict[str, str] | None = None,
) -> Any:
    """Perform a GET request with optional pagination and data extraction."""
    response = await session.get(url, params)
    await _raise_for_status(response)
    data: dict[str, Any] = response.json()

    if data_type == "regular":
        return data

    if data_type == "results":
        return data.get("results", [])

    if data_type == "indexzero":
        results = data.get("results", [])
        return results[0] if results else None

    if data_type == "pagination":
        results = list(data.get("results", []))
        next_url: str | None = data.get("next")
        while next_url:
            _assert_trusted_url(next_url)
            resp = await session.get(next_url)
            await _raise_for_status(resp)
            page: dict[str, Any] = resp.json()
            results.extend(page.get("results", []))
            next_url = page.get("next")
        return results

    return data


async def request_post(
    session: Session,
    url: str,
    *,
    payload: dict[str, object] | None = None,
    as_json: bool = False,
    timeout: float | None = None,
) -> Any:
    """Perform a POST request."""
    response = await session.post(url, payload, as_json=as_json, timeout=timeout)
    await _raise_for_status(response)
    if response.status_code == 204:
        return {}
    return response.json()


async def request_delete(session: Session, url: str) -> Any:
    """Perform a DELETE request."""
    response = await session.delete(url)
    await _raise_for_status(response)
    if response.status_code == 204:
        return {}
    try:
        return response.json()
    except Exception:
        return {}


async def _raise_for_status(response: Any) -> None:
    """Map HTTP error status codes to the exception hierarchy."""
    if 200 <= response.status_code < 300:
        return

    status = response.status_code
    body: dict[str, Any] | None = None
    try:
        body = response.json()
    except Exception:
        body = None

    detail = ""
    if body:
        raw = body.get("detail") or body.get("error") or json.dumps(body)
        detail = redact_tokens(str(raw))

    msg = f"HTTP {status}: {detail}" if detail else f"HTTP {status}"
    safe_body = scrub_sensitive_keys(body) if body else None

    if status == 404:
        raise NotFoundError(msg, status_code=status, response_body=safe_body)
    if status == 429:
        raise RateLimitError(msg, status_code=status, response_body=safe_body)
    raise APIError(msg, status_code=status, response_body=safe_body)
