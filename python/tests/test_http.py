"""Tests for HTTP request helpers."""

import pytest
import respx
from httpx import Response

from robinhood_agents._errors import APIError, NotFoundError, RateLimitError
from robinhood_agents._http import request_delete, request_get, request_post
from robinhood_agents._session import Session


@pytest.fixture
async def session() -> Session:
    return Session()


class TestRequestGet:
    @respx.mock
    async def test_regular(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/user/").mock(
            return_value=Response(200, json={"username": "test"})
        )
        result = await request_get(session, "https://api.robinhood.com/user/")
        assert result["username"] == "test"

    @respx.mock
    async def test_results(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/accounts/").mock(
            return_value=Response(200, json={"results": [{"id": "1"}, {"id": "2"}]})
        )
        result = await request_get(
            session, "https://api.robinhood.com/accounts/", data_type="results"
        )
        assert len(result) == 2

    @respx.mock
    async def test_indexzero(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/portfolios/").mock(
            return_value=Response(200, json={"results": [{"equity": "1000"}]})
        )
        result = await request_get(
            session, "https://api.robinhood.com/portfolios/", data_type="indexzero"
        )
        assert result["equity"] == "1000"

    @respx.mock
    async def test_indexzero_empty(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/portfolios/").mock(
            return_value=Response(200, json={"results": []})
        )
        result = await request_get(
            session, "https://api.robinhood.com/portfolios/", data_type="indexzero"
        )
        assert result is None

    @respx.mock
    async def test_404_raises_not_found(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/missing/").mock(
            return_value=Response(404, json={"detail": "Not found"})
        )
        with pytest.raises(NotFoundError):
            await request_get(session, "https://api.robinhood.com/missing/")

    @respx.mock
    async def test_429_raises_rate_limit(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/slow/").mock(
            return_value=Response(429, json={"detail": "Too many requests"})
        )
        with pytest.raises(RateLimitError):
            await request_get(session, "https://api.robinhood.com/slow/")

    @respx.mock
    async def test_500_raises_api_error(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/broken/").mock(
            return_value=Response(500, json={"error": "Internal"})
        )
        with pytest.raises(APIError) as exc_info:
            await request_get(session, "https://api.robinhood.com/broken/")
        assert exc_info.value.status_code == 500

    @respx.mock
    async def test_pagination(self, session: Session) -> None:
        pages = iter(
            [
                Response(
                    200,
                    json={
                        "results": [{"id": "1"}],
                        "next": "https://api.robinhood.com/positions/?cursor=page2",
                    },
                ),
                Response(200, json={"results": [{"id": "2"}], "next": None}),
            ]
        )
        respx.get(url__startswith="https://api.robinhood.com/positions/").mock(
            side_effect=lambda _req: next(pages)
        )
        result = await request_get(
            session, "https://api.robinhood.com/positions/", data_type="pagination"
        )
        assert len(result) == 2
        assert result[0]["id"] == "1"
        assert result[1]["id"] == "2"

    @respx.mock
    async def test_pagination_rejects_untrusted_next(self, session: Session) -> None:
        respx.get("https://api.robinhood.com/positions/").mock(
            return_value=Response(
                200,
                json={
                    "results": [{"id": "1"}],
                    "next": "https://evil.example.com/steal?data=1",
                },
            )
        )
        with pytest.raises(APIError, match="untrusted"):
            await request_get(
                session, "https://api.robinhood.com/positions/", data_type="pagination"
            )


class TestRequestPost:
    @respx.mock
    async def test_post_json(self, session: Session) -> None:
        respx.post("https://api.robinhood.com/orders/").mock(
            return_value=Response(200, json={"id": "order1"})
        )
        result = await request_post(
            session,
            "https://api.robinhood.com/orders/",
            payload={"symbol": "AAPL"},
            as_json=True,
        )
        assert result["id"] == "order1"

    @respx.mock
    async def test_post_204(self, session: Session) -> None:
        respx.post("https://api.robinhood.com/cancel/").mock(return_value=Response(204))
        result = await request_post(session, "https://api.robinhood.com/cancel/")
        assert result == {}


class TestRequestDelete:
    @respx.mock
    async def test_delete_204(self, session: Session) -> None:
        respx.delete("https://api.robinhood.com/resource/").mock(return_value=Response(204))
        result = await request_delete(session, "https://api.robinhood.com/resource/")
        assert result == {}
