"""HTTP session wrapper for Robinhood API using httpx."""

from collections.abc import Awaitable, Callable
from urllib.parse import urlencode, urljoin, urlparse

import httpx

DEFAULT_HEADERS: dict[str, str] = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=1",
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    "X-Robinhood-API-Version": "1.431.4",
    "User-Agent": "robinhood-for-agents-python/0.1.0",
}

_DEFAULT_TIMEOUT = 16.0

# Trusted Robinhood origins for redirect safety.
_TRUSTED_ORIGINS = frozenset(
    {
        "https://api.robinhood.com",
        "https://nummus.robinhood.com",
        "https://robinhood.com",
    }
)


async def _safe_fetch(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    content: str | None = None,
    max_redirects: int = 5,
    timeout: httpx.Timeout | None = None,
) -> httpx.Response:
    """Follow redirects manually, refusing to send auth headers to untrusted hosts."""
    current_url = url

    for _ in range(max_redirects + 1):
        resp = await client.request(
            method,
            current_url,
            headers=headers,
            content=content,
            follow_redirects=False,
            timeout=timeout if timeout is not None else client.timeout,
        )

        if resp.status_code < 300 or resp.status_code >= 400:
            return resp

        # 3xx redirect
        location = resp.headers.get("location")
        if not location:
            return resp

        resolved = urljoin(current_url, location)
        parsed = urlparse(resolved)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in _TRUSTED_ORIGINS:
            msg = f"Refusing redirect to untrusted host: {parsed.hostname}"
            raise RuntimeError(msg)
        current_url = resolved

    msg = "Too many redirects"
    raise RuntimeError(msg)


class Session:
    """Async HTTP session for Robinhood API requests."""

    on_unauthorized: Callable[[], Awaitable[str | None]] | None
    """Called on 401. Should refresh the token and return the new access token."""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._headers = {**DEFAULT_HEADERS}
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout, follow_redirects=False)
        self._access_token: str | None = None
        self.on_unauthorized = None

    def set_access_token(self, token: str) -> None:
        """Set the access token for Bearer auth injection."""
        self._access_token = token

    def clear_access_token(self) -> None:
        """Clear the access token."""
        self._access_token = None

    def _auth_headers(self, base: dict[str, str]) -> dict[str, str]:
        """Build headers with Authorization injected if token is set."""
        if self._access_token:
            return {**base, "Authorization": f"Bearer {self._access_token}"}
        return base

    async def _fetch_with_retry(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        content: str | None = None,
        timeout: httpx.Timeout | None = None,
    ) -> httpx.Response:
        """Fetch with single-retry on 401."""
        resp = await _safe_fetch(
            self._client,
            method,
            url,
            headers=headers,
            content=content,
            timeout=timeout,
        )

        if resp.status_code == 401 and self.on_unauthorized:
            new_token = await self.on_unauthorized()
            if new_token:
                self._access_token = new_token
                headers = {**headers, "Authorization": f"Bearer {new_token}"}
                resp = await _safe_fetch(
                    self._client,
                    method,
                    url,
                    headers=headers,
                    content=content,
                    timeout=timeout,
                )

        return resp

    async def get(self, url: str, params: dict[str, str] | None = None) -> httpx.Response:
        target = f"{url}?{urlencode(params)}" if params else url
        return await self._fetch_with_retry(
            "GET",
            target,
            headers=self._auth_headers(self._headers),
        )

    async def post(
        self,
        url: str,
        body: dict[str, object] | None = None,
        *,
        as_json: bool = False,
        timeout: float | None = None,
    ) -> httpx.Response:
        headers = self._auth_headers({**self._headers})

        if as_json:
            import json

            headers["Content-Type"] = "application/json"
            content = json.dumps(body or {})
        else:
            for k, v in (body or {}).items():
                if v is not None and isinstance(v, dict):
                    msg = (
                        f'Cannot form-encode nested object at key "{k}". '
                        "Use as_json=True for complex payloads."
                    )
                    raise ValueError(msg)
            content = urlencode(
                [(k, str(v)) for k, v in (body or {}).items()],
            )

        req_timeout = httpx.Timeout(timeout) if timeout and timeout != self._timeout else None
        return await self._fetch_with_retry(
            "POST",
            url,
            headers=headers,
            content=content,
            timeout=req_timeout,
        )

    async def delete(self, url: str) -> httpx.Response:
        return await self._fetch_with_retry(
            "DELETE",
            url,
            headers=self._auth_headers(self._headers),
        )

    async def close(self) -> None:
        await self._client.aclose()
