# OpenClaw Workspace Dependency Resolution

**Issue:** [#10](https://github.com/kevin1chun/robinhood-for-agents/issues/10)
**Date:** 2026-03-31

## Problem

After `robinhood-for-agents onboard` for OpenClaw, the CLI reports success but Bun cannot resolve `robinhood-for-agents` as an import from the OpenClaw workspace (`~/.openclaw/workspace/`).

**Root cause:** The onboard flow copies skill markdown files to `~/.openclaw/workspace/skills/` but never installs `robinhood-for-agents` as an npm dependency in the workspace. The skill instructs the agent to run `bun -e 'import { getClient } from "robinhood-for-agents"'`, which requires the package in a `node_modules/` directory resolvable from the workspace.

Claude Code handles this via the `install` frontmatter in SKILL.md, which its skill loader processes automatically. OpenClaw does not process this frontmatter, so the onboard flow must compensate.

Global npm install (`npm install -g`) does not fix this because Bun's module resolution does not check the global npm prefix.

## Design

### 1. Extend `AgentMeta` with `workspaceDir`

Add an optional `workspaceDir` field to `AgentMeta` in `typescript/src/server/cli/agents/types.ts`:

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

`workspaceDir` declares where the agent's runtime resolves modules from. When set, the onboard/install flow will run `npm install robinhood-for-agents` in that directory.

### 2. Set `workspaceDir` on OpenClaw

In `typescript/src/server/cli/agents/openclaw.ts`:

```typescript
const WORKSPACE_DIR = join(homedir(), ".openclaw", "workspace");

export const openclaw: AgentMeta = {
  // ...existing fields
  workspaceDir: WORKSPACE_DIR,
};
```

The existing `SKILLS_DIR` is derived from `WORKSPACE_DIR` (`join(WORKSPACE_DIR, "skills")`). Extract `WORKSPACE_DIR` as a named constant.

### 3. Install workspace dependency in onboard flow

In `typescript/src/server/cli/onboard.ts`, after skill installation:

- If `agent.workspaceDir` is set:
  1. Ensure the directory exists
  2. Initialize `package.json` if absent (npm requires it)
  3. Run `npm install robinhood-for-agents` with `cwd` set to the workspace
  4. Show a spinner during install
  5. Handle errors non-fatally (log and continue, like skill installation)

### 4. Support in standalone `install` command

The `install` command in `typescript/bin/robinhood-for-agents.ts` should also install the workspace dependency when the target agent has `workspaceDir` set.

## Files Changed

| File | Change |
|------|--------|
| `typescript/src/server/cli/agents/types.ts` | Add `workspaceDir?: string` to `AgentMeta` |
| `typescript/src/server/cli/agents/openclaw.ts` | Extract `WORKSPACE_DIR`, set `workspaceDir` on export |
| `typescript/src/server/cli/onboard.ts` | Add workspace dependency install step after skills |
| `typescript/bin/robinhood-for-agents.ts` | Add workspace dependency install to `install` command |

## Testing

- Unit test: verify `openclaw.workspaceDir` is set to the expected path
- Unit test: mock `execSync`, verify `npm install` is called with correct `cwd` when `workspaceDir` is present
- Unit test: verify no `npm install` when `workspaceDir` is absent (Claude Code, Codex)

## Not in scope

- Changes to Claude Code or Codex agent configs (they don't need this)
- Changes to the skill markdown files
- Automatic version pinning (npm install gets latest, consistent with how Claude Code's skill loader works)
