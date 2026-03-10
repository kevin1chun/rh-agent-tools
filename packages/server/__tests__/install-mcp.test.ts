import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({ execSync: execSyncMock }));

describe("installMcp", () => {
  it("removes existing entry then adds via claude CLI", async () => {
    execSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../src/cli/install-mcp.js");
    installMcp();

    // First call: remove existing
    expect(execSyncMock).toHaveBeenCalledWith("claude mcp remove rh-for-agents", {
      stdio: "pipe",
    });

    // Second call: add new
    const addCall = execSyncMock.mock.calls[1] as unknown[];
    expect(addCall[0]).toMatch(
      /^claude mcp add -s user rh-for-agents -- bun run .+rh-for-agents\.ts$/,
    );
    expect(addCall[1]).toEqual({ stdio: "pipe" });
  });

  it("continues when remove throws (entry not found)", async () => {
    execSyncMock.mockReset();
    // First call (remove) throws, second call (add) succeeds
    execSyncMock
      .mockImplementationOnce(() => {
        throw new Error("not found");
      })
      .mockReturnValueOnce(Buffer.from(""));

    const { installMcp } = await import("../src/cli/install-mcp.js");
    installMcp();

    // Should still call add despite remove failing
    expect(execSyncMock).toHaveBeenCalledTimes(2);
    const addCall = execSyncMock.mock.calls[1] as unknown[];
    expect(addCall[0]).toContain("claude mcp add");
  });

  it("uses the correct bin path", async () => {
    execSyncMock.mockReset();
    execSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../src/cli/install-mcp.js");
    installMcp();

    const addCall = execSyncMock.mock.calls[1] as unknown[];
    const expectedBinPath = resolve(import.meta.dirname, "../bin/rh-for-agents.ts");
    expect(addCall[0]).toContain(expectedBinPath);
  });
});
