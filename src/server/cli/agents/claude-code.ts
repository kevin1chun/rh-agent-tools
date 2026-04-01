import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentMeta } from "./types.js";

function installMcp(binPath: string): void {
  // Remove existing entry (ignore errors if not found)
  try {
    execFileSync("claude", ["mcp", "remove", "robinhood-for-agents"], { stdio: "pipe" });
  } catch {
    // not found — fine
  }

  execFileSync(
    "claude",
    ["mcp", "add", "-s", "user", "robinhood-for-agents", "--", "bun", "run", binPath],
    {
      stdio: "pipe",
    },
  );
}

function installSkills(skillsSource: string): void {
  const destDir = join(process.cwd(), ".claude", "skills");
  mkdirSync(destDir, { recursive: true });

  if (!existsSync(skillsSource)) return;

  const skills = readdirSync(skillsSource, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const skill of skills) {
    cpSync(join(skillsSource, skill.name), join(destDir, skill.name), {
      recursive: true,
      force: true,
    });
  }
}

export const claudeCode: AgentMeta = {
  id: "claude-code",
  name: "Claude Code",
  description: "Anthropic's coding agent",
  cli: "claude",
  supportsSkills: true,
  installMcp,
  installSkills,
  postInstallHint: "Restart Claude Code to pick up the changes.",
};
