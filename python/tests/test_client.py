"""Tests for RobinhoodClient."""

import pytest

from robinhood_agents import NotLoggedInError, RobinhoodClient


class TestClientAuth:
    def test_not_logged_in_by_default(self, client: RobinhoodClient) -> None:
        assert client.is_logged_in is False

    async def test_requires_auth(self, client: RobinhoodClient) -> None:
        with pytest.raises(NotLoggedInError):
            await client.get_accounts()

    async def test_context_manager(self) -> None:
        async with RobinhoodClient() as client:
            assert client.is_logged_in is False
