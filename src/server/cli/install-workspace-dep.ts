import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Install `robinhood-for-agents` as an npm dependency in a workspace directory.
 * Creates a minimal package.json if one doesn't exist.
 */
export function installWorkspaceDep(workspaceDir: string): void {
  mkdirSync(workspaceDir, { recursive: true });

  const pkgPath = join(workspaceDir, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(pkgPath, `${JSON.stringify({ name: "workspace", private: true }, null, 2)}\n`);
  }

  execFileSync("npm", ["install", "robinhood-for-agents"], {
    cwd: workspaceDir,
    stdio: "pipe",
  });
}
