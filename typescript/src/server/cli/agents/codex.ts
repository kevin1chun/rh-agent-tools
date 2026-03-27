import { execFileSync } from "node:child_process";
import type { AgentMeta } from "./types.js";

function installMcp(binPath: string): void {
  execFileSync("codex", ["mcp", "add", "robinhood-for-agents", "--", "bun", "run", binPath], {
    stdio: "pipe",
  });
}

export const codex: AgentMeta = {
  id: "codex",
  name: "Codex",
  description: "OpenAI's coding agent",
  cli: "codex",
  supportsSkills: false,
  installMcp,
  postInstallHint: "Restart Codex to pick up the changes.",
};
