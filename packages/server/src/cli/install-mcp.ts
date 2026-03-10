import { resolve } from "node:path";
import { claudeCode } from "./agents/claude-code.js";

export function installMcp(): void {
  const binPath = resolve(import.meta.dirname, "../../bin/rh-for-agents.ts");

  claudeCode.installMcp?.(binPath);

  console.log(`  MCP server added via 'claude mcp add -s user'`);
  console.log(`  Command: bun run ${binPath}`);
}
