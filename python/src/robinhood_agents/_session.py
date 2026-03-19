"""HTTP session wrapper for Robinhood API using httpx."""

from urllib.parse import urlencode, urlparse

import httpx

from ._urls import get_proxy_token, get_proxy_url, trusted_origins

DEFAULT_HEADERS: dict[str, str] = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=1",
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    "X-Robinhood-API-Version": "1.431.4",
    "User-Agent": "robinhood-for-agents-python/0.1.0",
}

_DEFAULT_TIMEOUT = 16.0


def _with_proxy_token(headers: dict[str, str]) -> dict[str, str]:
    """Attach X-Proxy-Token header if the URL targets the proxy."""
    proxy = get_proxy_url()
    token = get_proxy_token()
    if not proxy or not token:
        return headers
    return {**headers, "X-Proxy-Token": token}


async def _safe_fetch(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    content: str | None = None,
    max_redirects: int = 5,
) -> httpx.Response:
    """Follow redirects manually, refusing to send auth headers to untrusted hosts."""
    enriched_headers = _with_proxy_token(headers)
    current_url = url

    for _ in range(max_redirects + 1):
        resp = await client.request(
            method,
            current_url,
            headers=enriched_headers,
            content=content,
            follow_redirects=False,
        )

        if resp.status_code < 300 or resp.status_code >= 400:
            return resp

        # 3xx redirect
        location = resp.headers.get("location")
        if not location:
            return resp

        # Resolve relative redirects
        from urllib.parse import urljoin

        resolved = urljoin(current_url, location)
        parsed = urlparse(resolved)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in trusted_origins():
            msg = f"Refusing redirect to untrusted host: {parsed.hostname}"
            raise RuntimeError(msg)
        current_url = resolved

    msg = "Too many redirects"
    raise RuntimeError(msg)


class Session:
    """Async HTTP session for Robinhood API requests."""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._headers = {**DEFAULT_HEADERS}
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout, follow_redirects=False)

    async def get(self, url: str, params: dict[str, str] | None = None) -> httpx.Response:
        target = f"{url}?{urlencode(params)}" if params else url
        return await _safe_fetch(self._client, "GET", target, headers=self._headers)

    async def post(
        self,
        url: str,
        body: dict[str, object] | None = None,
        *,
        as_json: bool = False,
        timeout: float | None = None,
    ) -> httpx.Response:
        headers = {**self._headers}

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

        if timeout and timeout != self._timeout:
            old_timeout = self._client.timeout
            self._client.timeout = httpx.Timeout(timeout)
            try:
                return await _safe_fetch(
                    self._client, "POST", url, headers=headers, content=content
                )
            finally:
                self._client.timeout = old_timeout

        return await _safe_fetch(self._client, "POST", url, headers=headers, content=content)

    async def delete(self, url: str) -> httpx.Response:
        return await _safe_fetch(self._client, "DELETE", url, headers=self._headers)

    async def close(self) -> None:
        await self._client.aclose()
