"""Exception hierarchy for the Robinhood API client."""


class RobinhoodError(Exception):
    """Base exception for all Robinhood client errors."""


class AuthenticationError(RobinhoodError):
    """Raised when authentication fails."""


class TokenExpiredError(AuthenticationError):
    """Raised when the cached token is no longer valid."""

    def __init__(self, message: str = "Cached token is no longer valid") -> None:
        super().__init__(message)


class NotLoggedInError(RobinhoodError):
    """Raised when an operation requires an authenticated session."""

    def __init__(self, message: str = "Operation requires an authenticated session") -> None:
        super().__init__(message)


class APIError(RobinhoodError):
    """Raised when the Robinhood API returns an error response."""

    status_code: int | None
    response_body: dict[str, object] | None

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        response_body: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class RateLimitError(APIError):
    """Raised when the API rate limit is exceeded (HTTP 429)."""


class NotFoundError(APIError):
    """Raised when a requested resource is not found (HTTP 404)."""
