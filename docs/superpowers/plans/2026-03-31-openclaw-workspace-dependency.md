# OpenClaw Workspace Dependency Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After `robinhood-for-agents onboard` for OpenClaw, `robinhood-for-agents` is installed as an npm dependency in `~/.openclaw/workspace/` so Bun can resolve the import.

**Architecture:** Add `workspaceDir` to `AgentMeta`. When set, the onboard flow runs `npm install robinhood-for-agents` in that directory after copying skills. Extract this as a reusable helper so the standalone `install` command can also use it.

**Tech Stack:** TypeScript, Bun, Vitest, Node child_process (`execFileSync`)

---

### Task 1: Add `workspaceDir` to `AgentMeta` and set it on OpenClaw

**Files:**
- Modify: `typescript/src/server/cli/agents/types.ts:3` (add field to interface)
- Modify: `typescript/src/server/cli/agents/openclaw.ts` (extract `WORKSPACE_DIR`, set field)

- [ ] **Step 1: Add `workspaceDir` to `AgentMeta`**

In `typescript/src/server/cli/agents/types.ts`, add the optional field after `installSkills`:

```typescript
export interface AgentMeta {
  id: AgentId;
  name: string;
  description: string;
  cli: string;
  supportsSkills: boolean;
  installMcp?: (binPath: string) => void;
  installSkills?: (skillsSource: string) => void;
  workspaceDir?: string;
  postInstallHint: string;
}
```

- [ ] **Step 2: Extract `WORKSPACE_DIR` and set `workspaceDir` on OpenClaw**

In `typescript/src/server/cli/agents/openclaw.ts`, extract a `WORKSPACE_DIR` constant and derive `SKILLS_DIR` from it. Add `workspaceDir` to the export:

```typescript
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
```

- [ ] **Step 3: Run typecheck**

Run: `cd typescript && bun run typecheck`
Expected: No errors. Claude Code and Codex don't set `workspaceDir` — it's optional, so they're fine.

- [ ] **Step 4: Commit**

```bash
git add typescript/src/server/cli/agents/types.ts typescript/src/server/cli/agents/openclaw.ts
git commit -m "feat: add workspaceDir to AgentMeta, set on OpenClaw (#10)"
```

---

### Task 2: Add workspace dependency install helper

**Files:**
- Create: `typescript/src/server/cli/install-workspace-dep.ts`
- Test: `typescript/__tests__/server/install-workspace-dep.test.ts`

- [ ] **Step 1: Write the failing test**

Create `typescript/__tests__/server/install-workspace-dep.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd typescript && npx vitest run __tests__/server/install-workspace-dep.test.ts`
Expected: FAIL — module `../../src/server/cli/install-workspace-dep.js` not found.

- [ ] **Step 3: Write the implementation**

Create `typescript/src/server/cli/install-workspace-dep.ts`:

```typescript
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
    writeFileSync(pkgPath, JSON.stringify({ name: "workspace", private: true }, null, 2) + "\n");
  }

  execFileSync("npm", ["install", "robinhood-for-agents"], {
    cwd: workspaceDir,
    stdio: "pipe",
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd typescript && npx vitest run __tests__/server/install-workspace-dep.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Run typecheck and lint**

Run: `cd typescript && bun run typecheck && bun run check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add typescript/src/server/cli/install-workspace-dep.ts typescript/__tests__/server/install-workspace-dep.test.ts
git commit -m "feat: add installWorkspaceDep helper (#10)"
```

---

### Task 3: Wire workspace dependency install into onboard flow

**Files:**
- Modify: `typescript/src/server/cli/onboard.ts:102-115` (add step after skills install)

- [ ] **Step 1: Add workspace dependency install step to onboard**

In `typescript/src/server/cli/onboard.ts`, after the skills installation block (after line 115), add the workspace dependency step. Import the helper at the top:

Add import at top of file:
```typescript
import { installWorkspaceDep } from "./install-workspace-dep.js";
```

After the skills install block (after the `}` on line 115), add:

```typescript
  // --- Install workspace dependency ---
  if (agent.workspaceDir) {
    const depSpinner = p.spinner();
    depSpinner.start("Installing robinhood-for-agents in workspace...");
    try {
      installWorkspaceDep(agent.workspaceDir);
      depSpinner.stop("robinhood-for-agents installed in workspace.");
    } catch (err) {
      depSpinner.stop("Workspace dependency install failed.");
      p.log.error(err instanceof Error ? err.message : "Unknown error during dependency install");
      // Non-fatal — continue
    }
  }
```

- [ ] **Step 2: Run typecheck**

Run: `cd typescript && bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add typescript/src/server/cli/onboard.ts
git commit -m "feat: install workspace dependency during onboard (#10)"
```

---

### Task 4: Support workspace dependency in standalone `install` command

**Files:**
- Modify: `typescript/bin/robinhood-for-agents.ts:25-44` (add `--agent` flag to install, wire up workspace dep)

- [ ] **Step 1: Update the install command to accept `--agent` and install workspace dep**

In `typescript/bin/robinhood-for-agents.ts`, replace the `install` branch (lines 25-44) with:

```typescript
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
```

- [ ] **Step 2: Update help text to document `--agent` flag on install**

In the same file, update the help text (lines 46-55):

```typescript
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
```

- [ ] **Step 3: Run typecheck and lint**

Run: `cd typescript && bun run typecheck && bun run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add typescript/bin/robinhood-for-agents.ts
git commit -m "feat: support --agent flag in install command for workspace dep (#10)"
```

---

### Task 5: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd typescript && npx vitest run`
Expected: All tests pass, including the new `install-workspace-dep.test.ts`.

- [ ] **Step 2: Run typecheck and lint**

Run: `cd typescript && bun run typecheck && bun run check`
Expected: No errors.

- [ ] **Step 3: Fix any lint issues**

If Biome reports formatting issues, run: `cd typescript && npx @biomejs/biome check --write .`
Then re-run typecheck and lint to confirm.

- [ ] **Step 4: Commit any fixes**

Only if Step 3 produced changes:
```bash
git add -A
git commit -m "fix: lint/format fixes"
```
