#!/usr/bin/env bun
export {};

const args = process.argv.slice(2);

/** Parse --chrome / --browser path from argv (supports --chrome <path> or --chrome=<path>). */
function parseBrowserPath(argv: string[]): string | undefined {
  const idx = argv.findIndex((a) => a === "--chrome" || a === "--browser");
  if (idx === -1) return undefined;
  const flag = argv[idx];
  const next = argv[idx + 1];
  if (flag?.includes("=")) return flag.split("=", 2)[1]?.trim();
  if (next && !next.startsWith("--")) return next;
  return undefined;
}

if (args[0] === "onboard" || args[0] === "setup") {
  const { onboard } = await import("../src/server/cli/onboard.js");
  const agentFlag = args.find((a) => a.startsWith("--agent=") || a.startsWith("--agent "));
  let preselected: "claude-code" | "openclaw" | "codex" | undefined;

  const agentIdx = args.indexOf("--agent");
  if (agentIdx !== -1 && args[agentIdx + 1]) {
    const val = args[agentIdx + 1];
    if (val === "claude-code" || val === "openclaw" || val === "codex") {
      preselected = val;
    }
  } else if (agentFlag?.startsWith("--agent=")) {
    const val = agentFlag.split("=")[1];
    if (val === "claude-code" || val === "openclaw" || val === "codex") {
      preselected = val;
    }
  }

  await onboard(preselected);
} else if (args[0] === "install") {
  const skillsOnly = args.includes("--skills");
  const mcpOnly = args.includes("--mcp");
  const both = !skillsOnly && !mcpOnly;

  console.log("robinhood-for-agents install\n");

  if (both || mcpOnly) {
    const { installMcp } = await import("../src/server/cli/install-mcp.js");
    installMcp();
  }

  if (both || skillsOnly) {
    const { installSkills } = await import("../src/server/cli/install-skills.js");
    installSkills(process.cwd());
  }

  if (both) {
    console.log("\nRestart Claude Code to pick up the changes.");
  }
} else if (args[0] === "login") {
  const executablePath = parseBrowserPath(args);
  const { browserLogin, formatLoginSuccessMessage } = await import("../src/server/browser-auth.js");
  try {
    const result = await browserLogin(executablePath ? { executablePath } : undefined);
    console.log(formatLoginSuccessMessage(result));
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Login failed.");
    process.exit(1);
  }
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`robinhood-for-agents — AI-native Robinhood trading interface

Usage:
  robinhood-for-agents                  Start the MCP server (stdio transport)
  robinhood-for-agents login            Browser login (auto-detects Brave/Chrome on macOS)
  robinhood-for-agents login --chrome <path>   Use specific browser (e.g. Brave)
  robinhood-for-agents onboard          Interactive setup TUI (all agents)
  robinhood-for-agents onboard --agent claude-code|openclaw|codex
  robinhood-for-agents install          Install MCP server config + skills (Claude Code)
  robinhood-for-agents install --mcp    Install MCP server config only
  robinhood-for-agents install --skills Install Claude Code skills only
  robinhood-for-agents --help           Show this help message`);
} else {
  const { main } = await import("../src/server/index.js");
  await main();
}
