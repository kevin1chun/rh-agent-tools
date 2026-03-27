"""Authentication — load tokens from a TokenStore and inject into the session.

Token refresh (on 401) is handled automatically via the session's
``on_unauthorized`` callback.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from time import time
from typing import TYPE_CHECKING
from urllib.parse import urlencode

import httpx

from ._errors import AuthenticationError
from ._token_store import TokenData, TokenStore
from ._types import LoginResult

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from ._session import Session

_CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"
_EXPIRATION_TIME = 734000
_MIN_REFRESH_INTERVAL = 5.0  # seconds


@dataclass
class AuthState:
    """Per-client token management state."""

    tokens: TokenData
    store: TokenStore
    _refresh_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    _refresh_task: asyncio.Task[str | None] | None = field(default=None, repr=False)
    _last_refresh_at: float = field(default=0.0, repr=False)


async def _refresh_tokens(state: AuthState) -> str | None:
    """Refresh the access token using refresh_token + device_token.

    Returns the new access token on success, None on failure.
    """
    tokens = state.tokens
    if not tokens.refresh_token or not tokens.device_token:
        return None

    body = {
        "grant_type": "refresh_token",
        "refresh_token": tokens.refresh_token,
        "scope": "internal",
        "client_id": _CLIENT_ID,
        "expires_in": str(_EXPIRATION_TIME),
        "device_token": tokens.device_token,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.robinhood.com/oauth2/token/",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                    "X-Robinhood-API-Version": "1.431.4",
                },
                content=urlencode(body),
            )
    except Exception:
        return None

    if not resp.is_success:
        return None

    try:
        data = resp.json()
    except Exception:
        return None

    if "access_token" not in data:
        return None

    new_tokens = TokenData(
        access_token=str(data["access_token"]),
        refresh_token=str(data.get("refresh_token", tokens.refresh_token)),
        token_type=str(data.get("token_type", "Bearer")),
        device_token=tokens.device_token,
        saved_at=time(),
    )

    # Update in-memory state
    state.tokens = new_tokens

    # Persist to store (best-effort)
    import contextlib

    with contextlib.suppress(Exception):
        await state.store.save(new_tokens)

    return new_tokens.access_token


def _create_refresh_callback(
    state: AuthState,
) -> Callable[[], Awaitable[str | None]]:
    """Create a 401-refresh callback with a concurrency guard.

    Concurrent 401s coalesce onto a single refresh attempt — all waiters
    get the same result, matching the TypeScript SDK's behaviour.
    """

    async def _refresh() -> str | None:
        # Rate limit: refuse to refresh if the last attempt was too recent
        if time() - state._last_refresh_at < _MIN_REFRESH_INTERVAL:
            return None

        async with state._refresh_lock:
            # If another coroutine already refreshed while we waited, return that result
            if state._refresh_task is not None:
                return await state._refresh_task
            state._last_refresh_at = time()
            state._refresh_task = asyncio.ensure_future(_refresh_tokens(state))
        try:
            return await state._refresh_task
        finally:
            state._refresh_task = None

    return _refresh


async def restore_session(
    session: Session,
    store: TokenStore,
) -> tuple[LoginResult, AuthState]:
    """Restore a session by loading tokens from the store."""
    tokens = await store.load()
    if not tokens:
        raise AuthenticationError(
            "No tokens found. Run 'robinhood-for-agents onboard' to authenticate."
        )

    # Set access token on the session for Bearer injection
    session.set_access_token(tokens.access_token)

    # Build auth state for refresh management
    state = AuthState(tokens=tokens, store=store)

    # Register 401 callback for automatic token refresh
    session.on_unauthorized = _create_refresh_callback(state)

    method = "encrypted_file" if "Encrypted" in type(store).__name__ else "keychain"

    return LoginResult(status="logged_in", method=method), state


def restore_session_from_token(session: Session, access_token: str) -> LoginResult:
    """Restore a session from a direct access token (no store, no refresh)."""
    session.set_access_token(access_token)
    return LoginResult(status="logged_in", method="token")


async def logout(session: Session, state: AuthState | None) -> None:
    """Logout — revoke the token and clear the store."""
    if state and state.tokens.access_token:
        # Attempt to revoke the token
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    "https://api.robinhood.com/oauth2/revoke_token/",
                    content=urlencode(
                        {
                            "client_id": _CLIENT_ID,
                            "token": state.tokens.access_token,
                        }
                    ),
                    headers={"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"},
                )
        except Exception:
            pass

        # Clear the store
        import contextlib

        with contextlib.suppress(Exception):
            await state.store.delete()

    session.clear_access_token()
    session.on_unauthorized = None
