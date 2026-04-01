import { describe, expect, it } from "vitest";
import { createSession, DEFAULT_HEADERS, RobinhoodSession } from "../../src/client/session.js";

describe("RobinhoodSession", () => {
  it("createSession returns a RobinhoodSession", () => {
    const session = createSession();
    expect(session).toBeInstanceOf(RobinhoodSession);
  });

  it("DEFAULT_HEADERS has required fields", () => {
    expect(DEFAULT_HEADERS["X-Robinhood-API-Version"]).toBe("1.431.4");
    expect(DEFAULT_HEADERS["User-Agent"]).toBe("robinhood-for-agents/0.1.0");
    expect(DEFAULT_HEADERS.Accept).toBe("*/*");
  });
});
