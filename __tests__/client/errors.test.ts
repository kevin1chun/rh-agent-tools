import { describe, expect, it } from "vitest";
import {
  APIError,
  AuthenticationError,
  NotFoundError,
  NotLoggedInError,
  RateLimitError,
  RobinhoodError,
  TokenExpiredError,
} from "../../src/client/errors.js";

describe("Exception hierarchy", () => {
  it("RobinhoodError is the base", () => {
    const err = new RobinhoodError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RobinhoodError);
    expect(err.message).toBe("test");
    expect(err.name).toBe("RobinhoodError");
  });

  it("AuthenticationError extends RobinhoodError", () => {
    const err = new AuthenticationError("bad creds");
    expect(err).toBeInstanceOf(RobinhoodError);
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("TokenExpiredError extends AuthenticationError", () => {
    const err = new TokenExpiredError();
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe("Cached token is no longer valid");
  });

  it("NotLoggedInError extends RobinhoodError", () => {
    const err = new NotLoggedInError();
    expect(err).toBeInstanceOf(RobinhoodError);
  });

  it("APIError stores status code and response body", () => {
    const body = { detail: "not found" };
    const err = new APIError("HTTP 404", { statusCode: 404, responseBody: body });
    expect(err).toBeInstanceOf(RobinhoodError);
    expect(err.statusCode).toBe(404);
    expect(err.responseBody).toEqual(body);
  });

  it("RateLimitError extends APIError", () => {
    const err = new RateLimitError("HTTP 429", { statusCode: 429 });
    expect(err).toBeInstanceOf(APIError);
    expect(err.statusCode).toBe(429);
  });

  it("NotFoundError extends APIError", () => {
    const err = new NotFoundError("HTTP 404", { statusCode: 404 });
    expect(err).toBeInstanceOf(APIError);
    expect(err.statusCode).toBe(404);
  });
});
