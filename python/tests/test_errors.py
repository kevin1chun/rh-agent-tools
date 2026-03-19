"""Tests for exception hierarchy."""

from robinhood_agents import (
    APIError,
    AuthenticationError,
    NotFoundError,
    NotLoggedInError,
    RateLimitError,
    RobinhoodError,
    TokenExpiredError,
)


class TestErrorHierarchy:
    def test_robinhood_error_is_exception(self) -> None:
        assert issubclass(RobinhoodError, Exception)

    def test_authentication_error_inherits(self) -> None:
        assert issubclass(AuthenticationError, RobinhoodError)

    def test_token_expired_inherits(self) -> None:
        assert issubclass(TokenExpiredError, AuthenticationError)
        err = TokenExpiredError()
        assert "Cached token" in str(err)

    def test_not_logged_in_inherits(self) -> None:
        assert issubclass(NotLoggedInError, RobinhoodError)
        err = NotLoggedInError()
        assert "authenticated session" in str(err)

    def test_api_error_inherits(self) -> None:
        assert issubclass(APIError, RobinhoodError)

    def test_api_error_carries_metadata(self) -> None:
        err = APIError("bad", status_code=400, response_body={"detail": "fail"})
        assert err.status_code == 400
        assert err.response_body == {"detail": "fail"}

    def test_api_error_defaults_none(self) -> None:
        err = APIError("bad")
        assert err.status_code is None
        assert err.response_body is None

    def test_rate_limit_inherits(self) -> None:
        assert issubclass(RateLimitError, APIError)

    def test_not_found_inherits(self) -> None:
        assert issubclass(NotFoundError, APIError)
