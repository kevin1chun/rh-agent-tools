"""Tests for authentication (proxy-only with auto-discovery)."""

from unittest.mock import patch

import pytest
import respx
from httpx import Response

from robinhood_agents._auth import _DEFAULT_PROXY, logout, restore_session
from robinhood_agents._errors import AuthenticationError
from robinhood_agents._session import Session


@pytest.fixture
async def session() -> Session:
    return Session()


def _reset_proxy() -> None:
    """Clear any proxy configuration between tests."""
    import robinhood_agents._urls as urls_mod

    urls_mod.API_BASE = "https://api.robinhood.com"
    urls_mod.NUMMUS_BASE = "https://nummus.robinhood.com"
    urls_mod._proxy_url = None
    urls_mod._proxy_token = None


class TestRestoreSession:
    @respx.mock
    async def test_with_env_proxy(self, session: Session) -> None:
        """When proxy is pre-configured (via env), use it directly."""
        import robinhood_agents._urls as urls_mod

        urls_mod._proxy_url = "http://localhost:9999"
        urls_mod._proxy_token = "test-token"
        try:
            respx.post("http://localhost:9999/reload-tokens").mock(
                return_value=Response(200, json={"status": "reloaded"})
            )
            result = await restore_session(session)
            assert result.status == "logged_in"
            assert result.method == "proxy"
        finally:
            _reset_proxy()

    @respx.mock
    async def test_auto_discover(self, session: Session) -> None:
        """When no env var, auto-discover proxy at default port."""
        _reset_proxy()
        respx.get(f"{_DEFAULT_PROXY}/health").mock(
            return_value=Response(200, json={"status": "ok"})
        )
        respx.post(f"{_DEFAULT_PROXY}/reload-tokens").mock(
            return_value=Response(200, json={"status": "reloaded"})
        )
        with patch("robinhood_agents._auth.load_proxy_token", return_value="discovered-token"):
            result = await restore_session(session)
        assert result.status == "logged_in"
        assert result.method == "proxy"
        _reset_proxy()

    @respx.mock
    async def test_no_proxy_raises(self, session: Session) -> None:
        """When no proxy is found anywhere, raise AuthenticationError."""
        _reset_proxy()
        respx.get(f"{_DEFAULT_PROXY}/health").mock(side_effect=ConnectionError)
        with pytest.raises(AuthenticationError, match="No auth proxy found"):
            await restore_session(session)

    @respx.mock
    async def test_reload_failure_non_fatal(self, session: Session) -> None:
        """Reload-tokens failure is non-fatal — session still established."""
        _reset_proxy()
        respx.get(f"{_DEFAULT_PROXY}/health").mock(
            return_value=Response(200, json={"status": "ok"})
        )
        respx.post(f"{_DEFAULT_PROXY}/reload-tokens").mock(side_effect=ConnectionError)
        with patch("robinhood_agents._auth.load_proxy_token", return_value=None):
            result = await restore_session(session)
        assert result.method == "proxy"
        _reset_proxy()


class TestLogout:
    @respx.mock
    async def test_posts_to_proxy(self, session: Session) -> None:
        """Logout POSTs to the proxy /logout endpoint."""
        import robinhood_agents._urls as urls_mod

        urls_mod._proxy_url = "http://localhost:9999"
        urls_mod._proxy_token = "test-token"
        try:
            route = respx.post("http://localhost:9999/logout").mock(
                return_value=Response(200, json={"status": "logged_out"})
            )
            await logout(session)
            assert route.called
        finally:
            _reset_proxy()

    async def test_no_proxy_noop(self, session: Session) -> None:
        """Logout with no proxy configured is a no-op."""
        _reset_proxy()
        await logout(session)  # should not raise
