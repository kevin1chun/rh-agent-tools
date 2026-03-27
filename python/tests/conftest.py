"""Shared fixtures for the test suite."""

import pytest

from robinhood_agents import RobinhoodClient


@pytest.fixture
def client() -> RobinhoodClient:
    return RobinhoodClient()
