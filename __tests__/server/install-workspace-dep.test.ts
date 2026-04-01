import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { installWorkspaceDep } from "../../src/server/cli/install-workspace-dep.js";

describe("installWorkspaceDep", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "rh-wsdep-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    vi.clearAllMocks();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("creates package.json if missing and runs npm install", () => {
    const dir = makeTempDir();
    installWorkspaceDep(dir);

    const pkgPath = join(dir, "package.json");
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.name).toBe("workspace");
    expect(pkg.private).toBe(true);

    expect(execFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "robinhood-for-agents"],
      expect.objectContaining({ cwd: dir }),
    );
  });

  it("does not overwrite existing package.json", () => {
    const dir = makeTempDir();
    const pkgPath = join(dir, "package.json");
    const original = JSON.stringify({ name: "my-project", version: "1.0.0" });
    writeFileSync(pkgPath, original);

    installWorkspaceDep(dir);

    const content = readFileSync(pkgPath, "utf-8");
    expect(JSON.parse(content).name).toBe("my-project");

    expect(execFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "robinhood-for-agents"],
      expect.objectContaining({ cwd: dir }),
    );
  });

  it("creates the workspace directory if it does not exist", () => {
    const dir = join(makeTempDir(), "nested", "workspace");
    installWorkspaceDep(dir);

    expect(existsSync(dir)).toBe(true);
    expect(execFileSync).toHaveBeenCalled();
  });
});
