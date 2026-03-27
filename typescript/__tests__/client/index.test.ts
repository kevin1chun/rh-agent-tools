import { describe, expect, it } from "vitest";
import {
  APIError,
  AuthenticationError,
  getClient,
  NotFoundError,
  NotLoggedInError,
  RateLimitError,
  RobinhoodClient,
  RobinhoodError,
  TokenExpiredError,
} from "../../src/client/index.js";

describe("Module exports", () => {
  it("exports RobinhoodClient", () => {
    expect(RobinhoodClient).toBeDefined();
    const client = new RobinhoodClient();
    expect(client).toBeInstanceOf(RobinhoodClient);
  });

  it("exports all error classes", () => {
    expect(RobinhoodError).toBeDefined();
    expect(AuthenticationError).toBeDefined();
    expect(TokenExpiredError).toBeDefined();
    expect(NotLoggedInError).toBeDefined();
    expect(APIError).toBeDefined();
    expect(RateLimitError).toBeDefined();
    expect(NotFoundError).toBeDefined();
  });

  it("getClient returns a singleton", () => {
    const a = getClient();
    const b = getClient();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(RobinhoodClient);
  });
});
