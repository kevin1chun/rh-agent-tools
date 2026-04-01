import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentMeta } from "./types.js";

const WORKSPACE_DIR = join(homedir(), ".openclaw", "workspace");
const SKILLS_DIR = join(WORKSPACE_DIR, "skills");

function installSkills(skillsSource: string): void {
  mkdirSync(SKILLS_DIR, { recursive: true });

  if (!existsSync(skillsSource)) return;

  const skills = readdirSync(skillsSource, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const skill of skills) {
    cpSync(join(skillsSource, skill.name), join(SKILLS_DIR, skill.name), {
      recursive: true,
      force: true,
    });
  }
}

export const openclaw: AgentMeta = {
  id: "openclaw",
  name: "OpenClaw",
  description: "Open-source personal AI assistant (skills only)",
  cli: "openclaw",
  supportsSkills: true,
  installSkills,
  workspaceDir: WORKSPACE_DIR,
  postInstallHint:
    "Restart the OpenClaw gateway to pick up the changes. For MCP tool support, configure @aiwerk/openclaw-mcp-bridge separately.",
};
