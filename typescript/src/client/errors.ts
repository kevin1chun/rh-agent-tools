/** Exception hierarchy for the Robinhood API client. */

export class RobinhoodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobinhoodError";
  }
}

export class AuthenticationError extends RobinhoodError {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(message = "Cached token is no longer valid") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

export class NotLoggedInError extends RobinhoodError {
  constructor(message = "Operation requires an authenticated session") {
    super(message);
    this.name = "NotLoggedInError";
  }
}

export class APIError extends RobinhoodError {
  readonly statusCode?: number;
  readonly responseBody?: Record<string, unknown>;

  constructor(
    message: string,
    opts?: { statusCode?: number; responseBody?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "APIError";
    this.statusCode = opts?.statusCode;
    this.responseBody = opts?.responseBody;
  }
}

export class RateLimitError extends APIError {
  constructor(
    message: string,
    opts?: { statusCode?: number; responseBody?: Record<string, unknown> },
  ) {
    super(message, opts);
    this.name = "RateLimitError";
  }
}

export class NotFoundError extends APIError {
  constructor(
    message: string,
    opts?: { statusCode?: number; responseBody?: Record<string, unknown> },
  ) {
    super(message, opts);
    this.name = "NotFoundError";
  }
}
