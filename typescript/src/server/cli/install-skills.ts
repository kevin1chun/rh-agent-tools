import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function installSkills(targetDir: string): void {
  const skillsSource = resolve(import.meta.dirname, "../../../skills");

  if (!existsSync(skillsSource)) {
    console.error(`Skills directory not found: ${skillsSource}`);
    process.exit(1);
  }

  const destDir = join(targetDir, ".claude", "skills");
  mkdirSync(destDir, { recursive: true });

  const skills = readdirSync(skillsSource, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const skill of skills) {
    const src = join(skillsSource, skill.name);
    const dest = join(destDir, skill.name);
    cpSync(src, dest, { recursive: true, force: true });
    console.log(`  ${skill.name}`);
  }

  console.log(`\nInstalled ${skills.length} skills to ${destDir}`);
}
