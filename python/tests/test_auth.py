"""Tests for authentication via TokenStore."""

from unittest.mock import AsyncMock

import pytest

from robinhood_agents._auth import logout, restore_session, restore_session_from_token
from robinhood_agents._errors import AuthenticationError
from robinhood_agents._session import Session
from robinhood_agents._token_store import TokenData


def _sample_tokens() -> TokenData:
    return TokenData(
        access_token="tok123",
        refresh_token="ref456",
        token_type="Bearer",
        device_token="dev789",
        saved_at=1000.0,
    )


def _mock_store(tokens: TokenData | None = None) -> AsyncMock:
    store = AsyncMock()
    store.load = AsyncMock(return_value=tokens)
    store.save = AsyncMock()
    store.delete = AsyncMock()
    return store


@pytest.fixture
async def session() -> Session:
    return Session()


class TestRestoreSession:
    async def test_loads_tokens_and_sets_access_token(self, session: Session) -> None:
        store = _mock_store(_sample_tokens())
        result, state = await restore_session(session, store)
        assert result.status == "logged_in"
        assert result.method == "keychain"
        assert state.tokens.access_token == "tok123"
        store.load.assert_called_once()

    async def test_raises_when_no_tokens(self, session: Session) -> None:
        store = _mock_store(None)
        with pytest.raises(AuthenticationError, match="No tokens found"):
            await restore_session(session, store)

    async def test_registers_unauthorized_callback(self, session: Session) -> None:
        store = _mock_store(_sample_tokens())
        await restore_session(session, store)
        assert session.on_unauthorized is not None


class TestRestoreSessionFromToken:
    def test_sets_token_directly(self, session: Session) -> None:
        result = restore_session_from_token(session, "direct-token")
        assert result.status == "logged_in"
        assert result.method == "token"


class TestLogout:
    async def test_clears_session(self, session: Session) -> None:
        store = _mock_store(_sample_tokens())
        _, state = await restore_session(session, store)
        await logout(session, state)
        assert session.on_unauthorized is None

    async def test_deletes_from_store(self, session: Session) -> None:
        store = _mock_store(_sample_tokens())
        _, state = await restore_session(session, store)
        await logout(session, state)
        store.delete.assert_called_once()

    async def test_null_state_noop(self, session: Session) -> None:
        await logout(session, None)  # should not raise
