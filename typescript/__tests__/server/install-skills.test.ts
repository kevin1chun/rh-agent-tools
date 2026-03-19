import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installSkills } from "../../src/server/cli/install-skills.js";

const EXPECTED_SKILLS = ["robinhood-for-agents"];

describe("installSkills", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "rh-skills-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("installs all skills to .claude/skills/", () => {
    const target = makeTempDir();
    installSkills(target);

    const skillsDir = join(target, ".claude", "skills");
    expect(existsSync(skillsDir)).toBe(true);

    const installed = readdirSync(skillsDir).sort();
    expect(installed).toEqual(EXPECTED_SKILLS);
  });

  it("each skill contains a SKILL.md", () => {
    const target = makeTempDir();
    installSkills(target);

    const skillsDir = join(target, ".claude", "skills");
    for (const skill of EXPECTED_SKILLS) {
      const skillMd = join(skillsDir, skill, "SKILL.md");
      expect(existsSync(skillMd)).toBe(true);

      const content = readFileSync(skillMd, "utf-8");
      expect(content).toContain(`name: ${skill}`);
    }
  });

  it("overwrites existing skills without error", () => {
    const target = makeTempDir();
    installSkills(target);
    installSkills(target);

    const skillsDir = join(target, ".claude", "skills");
    const installed = readdirSync(skillsDir).sort();
    expect(installed).toEqual(EXPECTED_SKILLS);
  });

  it("copies reference.md and client-api.md for the unified skill", () => {
    const target = makeTempDir();
    installSkills(target);

    const skillDir = join(target, ".claude", "skills", "robinhood-for-agents");
    expect(existsSync(join(skillDir, "reference.md"))).toBe(true);
    expect(existsSync(join(skillDir, "client-api.md"))).toBe(true);
  });
});
