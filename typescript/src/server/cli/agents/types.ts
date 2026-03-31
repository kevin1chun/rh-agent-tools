export type AgentId = "claude-code" | "openclaw" | "codex";

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

export const AGENTS: ReadonlyArray<{
  value: AgentId;
  label: string;
  hint: string;
}> = [
  {
    value: "claude-code",
    label: "Claude Code",
    hint: "Anthropic's coding agent",
  },
  {
    value: "openclaw",
    label: "OpenClaw",
    hint: "Open-source personal AI assistant",
  },
  {
    value: "codex",
    label: "Codex",
    hint: "OpenAI's coding agent",
  },
];
