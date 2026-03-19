"""Authentication via the auth proxy.

The proxy (TypeScript: src/server/proxy.ts) holds tokens in the OS keychain
and injects Bearer headers.  This module ensures the proxy is reachable and
triggers a token reload after browser login.

Auto-discovery: if ``ROBINHOOD_API_PROXY`` is not set, the SDK checks
``127.0.0.1:3100`` for a running proxy before raising an error.

The Python SDK does NOT include browser login — use the TypeScript CLI
(``robinhood-for-agents login``) to authenticate.
"""

import httpx

from ._errors import AuthenticationError
from ._session import Session
from ._token_store import load_proxy_token
from ._types import LoginResult
from ._urls import configure_proxy, get_proxy_token, get_proxy_url

_DEFAULT_PROXY = "http://127.0.0.1:3100"


def _proxy_headers() -> dict[str, str]:
    """Build headers for direct proxy control requests."""
    token = get_proxy_token()
    return {"X-Proxy-Token": token} if token else {}


async def _discover_proxy() -> str | None:
    """Check the default port for a running auth proxy."""
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            resp = await client.get(f"{_DEFAULT_PROXY}/health")
            if resp.is_success:
                return _DEFAULT_PROXY
    except Exception:
        pass
    return None


async def restore_session(session: Session) -> LoginResult:
    """Restore a session via the auth proxy.

    Resolution order:

    1. ``ROBINHOOD_API_PROXY`` env var (set at module load in ``_urls.py``)
    2. Auto-discover proxy at ``127.0.0.1:3100``
    3. Raise ``AuthenticationError`` with setup instructions
    """
    proxy_url = get_proxy_url()

    if not proxy_url:
        proxy_url = await _discover_proxy()
        if proxy_url:
            proxy_token = load_proxy_token()
            configure_proxy(proxy_url, proxy_token)

    if not proxy_url:
        raise AuthenticationError(
            "No auth proxy found. Start it first:\n"
            "  robinhood-for-agents proxy\n\n"
            "Or set ROBINHOOD_API_PROXY for remote proxies."
        )

    # Ask the proxy to reload tokens from keychain
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(
                f"{proxy_url}/reload-tokens",
                headers=_proxy_headers(),
            )
    except Exception:
        # Proxy might not support this endpoint yet — not fatal
        pass

    return LoginResult(status="logged_in", method="proxy")


async def logout(session: Session) -> None:
    """Logout via the auth proxy."""
    proxy_url = get_proxy_url()
    if not proxy_url:
        return

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{proxy_url}/logout",
                headers=_proxy_headers(),
            )
    except Exception:
        pass
