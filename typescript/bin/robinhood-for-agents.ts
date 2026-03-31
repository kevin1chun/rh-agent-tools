#!/usr/bin/env bun
export {};

const args = process.argv.slice(2);

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

  // Parse --agent flag for workspace dep install
  let agentId: string | undefined;
  const agentIdx = args.indexOf("--agent");
  if (agentIdx !== -1 && args[agentIdx + 1]) {
    agentId = args[agentIdx + 1];
  } else {
    const agentFlag = args.find((a) => a.startsWith("--agent="));
    if (agentFlag) agentId = agentFlag.split("=")[1];
  }

  console.log("robinhood-for-agents install\n");

  if (both || mcpOnly) {
    const { installMcp } = await import("../src/server/cli/install-mcp.js");
    installMcp();
  }

  if (both || skillsOnly) {
    const { installSkills } = await import("../src/server/cli/install-skills.js");
    installSkills(process.cwd());
  }

  // Install workspace dependency for agents that need it
  if (agentId) {
    const { claudeCode } = await import("../src/server/cli/agents/claude-code.js");
    const { openclaw } = await import("../src/server/cli/agents/openclaw.js");
    const { codex } = await import("../src/server/cli/agents/codex.js");
    const agents = { "claude-code": claudeCode, openclaw, codex } as const;
    const agent = agents[agentId as keyof typeof agents];
    if (agent?.workspaceDir) {
      const { installWorkspaceDep } = await import("../src/server/cli/install-workspace-dep.js");
      console.log("Installing workspace dependency...");
      installWorkspaceDep(agent.workspaceDir);
      console.log("robinhood-for-agents installed in workspace.");
    }
  }

  if (both && !agentId) {
    console.log("\nRestart Claude Code to pick up the changes.");
  }
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`robinhood-for-agents — AI-native Robinhood trading interface

Usage:
  robinhood-for-agents                  Start the MCP server (stdio transport)
  robinhood-for-agents onboard          Interactive setup TUI (all agents)
  robinhood-for-agents onboard --agent claude-code|openclaw|codex
  robinhood-for-agents install          Install MCP server config + skills (Claude Code)
  robinhood-for-agents install --mcp    Install MCP server config only
  robinhood-for-agents install --skills Install Claude Code skills only
  robinhood-for-agents install --agent openclaw  Install for a specific agent
  robinhood-for-agents --help           Show this help message`);
} else {
  const { main } = await import("../src/server/index.js");
  await main();
}
