import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { loadTokens } from "../../client/token-store.js";
import { claudeCode } from "./agents/claude-code.js";
import { codex } from "./agents/codex.js";
import { openclaw } from "./agents/openclaw.js";
import type { AgentId, AgentMeta } from "./agents/types.js";
import { AGENTS } from "./agents/types.js";
import { isCliAvailable } from "./detect.js";

const agentMap: Record<AgentId, AgentMeta> = {
  "claude-code": claudeCode,
  openclaw,
  codex,
};

export async function onboard(preselectedAgent?: AgentId): Promise<void> {
  p.intro("robinhood-for-agents setup");

  // --- Agent selection ---
  let agentId: AgentId;

  if (preselectedAgent) {
    agentId = preselectedAgent;
    p.log.info(`Agent: ${agentMap[agentId].name}`);
  } else {
    const selected = await p.select({
      message: "Select your AI agent",
      options: AGENTS.map((a) => ({
        value: a.value,
        label: a.label,
        hint: a.hint,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    agentId = selected;
  }

  const agent = agentMap[agentId];

  // --- CLI detection ---
  if (!isCliAvailable(agent.cli)) {
    p.log.warn(
      `'${agent.cli}' not found on PATH. Install ${agent.name} first, or continue anyway.`,
    );

    const proceed = await p.confirm({
      message: "Continue with installation?",
      initialValue: false,
    });

    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
  }

  // --- Confirm installation scope ---
  const installItems: string[] = [];
  if (agent.installMcp) {
    installItems.push("Register robinhood-for-agents MCP server");
  }
  if (agent.supportsSkills) {
    installItems.push("Install 5 trading skills");
  }

  p.log.info(
    `Ready to install. This will:\n${installItems.map((item) => `  • ${item}`).join("\n")}`,
  );

  const confirmInstall = await p.confirm({
    message: "Proceed?",
    initialValue: true,
  });

  if (p.isCancel(confirmInstall) || !confirmInstall) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  // --- Install MCP ---
  const binPath = resolve(import.meta.dirname, "../../../bin/robinhood-for-agents.ts");

  if (agent.installMcp) {
    const mcpSpinner = p.spinner();
    mcpSpinner.start("Installing MCP config...");
    try {
      agent.installMcp(binPath);
      mcpSpinner.stop("MCP server registered.");
    } catch (err) {
      mcpSpinner.stop("MCP installation failed.");
      p.log.error(err instanceof Error ? err.message : "Unknown error during MCP install");
      process.exit(1);
    }
  }

  // --- Install skills ---
  if (agent.supportsSkills && agent.installSkills) {
    const skillsSource = resolve(import.meta.dirname, "../../../skills");
    const skillsSpinner = p.spinner();
    skillsSpinner.start("Installing skills...");
    try {
      agent.installSkills(skillsSource);
      skillsSpinner.stop("5 trading skills installed.");
    } catch (err) {
      skillsSpinner.stop("Skills installation failed.");
      p.log.error(err instanceof Error ? err.message : "Unknown error during skills install");
      // Non-fatal — continue
    }
  }

  // --- Login ---
  let skipLogin = false;

  // Check for existing session
  let existingTokens: Awaited<ReturnType<typeof loadTokens>> | null = null;
  try {
    existingTokens = await loadTokens();
  } catch {
    // Corrupted file, keytar failure, etc. — fall through to login prompt
  }
  if (existingTokens) {
    const reuse = await p.confirm({
      message: "Existing Robinhood session found. Skip login?",
      initialValue: true,
    });

    if (!p.isCancel(reuse) && reuse) {
      skipLogin = true;
    }
  }

  if (!skipLogin) {
    const wantLogin = await p.confirm({
      message: "Log in to Robinhood? Chrome will open to robinhood.com/login",
      initialValue: true,
    });

    if (!p.isCancel(wantLogin) && wantLogin) {
      const loginSpinner = p.spinner();
      loginSpinner.start("Waiting for login...");
      try {
        const { browserLogin } = await import("../browser-auth.js");
        const result = await browserLogin();
        loginSpinner.stop(
          `Logged in${result.account_hint ? ` (account ${result.account_hint})` : ""}.`,
        );
      } catch (err) {
        loginSpinner.stop("Login failed.");
        p.log.error(err instanceof Error ? err.message : "Unknown error during login");
      }
    }
  }

  // --- Deployment mode ---
  let tokensAvailable = false;
  try {
    tokensAvailable = !!(await loadTokens());
  } catch {
    // Keychain unavailable
  }

  if (tokensAvailable) {
    const deployment = await p.select({
      message: "Where is your agent running?",
      options: [
        {
          value: "local" as const,
          label: "This machine (local)",
          hint: "tokens in OS keychain — ready to go",
        },
        {
          value: "docker" as const,
          label: "Docker container / remote host",
          hint: "exports encrypted tokens",
        },
      ],
    });

    if (p.isCancel(deployment)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (deployment === "docker") {
      await exportEncryptedTokens();
    } else {
      p.log.success("Tokens are stored in the OS keychain. Ready to use.");
    }
  }

  // --- Done ---
  p.outro(`Done! ${agent.postInstallHint}`);
}

// ---------------------------------------------------------------------------
// Deployment helpers
// ---------------------------------------------------------------------------

async function exportEncryptedTokens(): Promise<void> {
  const { EncryptedFileTokenStore, KeychainTokenStore } = await import(
    "../../client/token-store.js"
  );

  const spinner = p.spinner();
  spinner.start("Encrypting tokens...");

  const keychain = new KeychainTokenStore();
  const tokens = await keychain.load();
  if (!tokens) {
    spinner.stop("No tokens found in keychain.");
    return;
  }

  const outputPath = "./tokens.enc";
  const store = new EncryptedFileTokenStore(outputPath);
  await store.save(tokens);

  // Read back the encryption key
  let encKey = process.env.ROBINHOOD_TOKEN_KEY?.trim() ?? "";
  if (!encKey) {
    try {
      encKey = (await Bun.secrets.get("robinhood-for-agents", "encryption-key")) ?? "";
    } catch {
      // Keychain unavailable
    }
  }

  spinner.stop(`Tokens encrypted to ${outputPath}`);

  p.log.step("Your encryption key:");
  p.log.message(`  ${encKey}`);

  p.log.step("Set these env vars in your container:");
  p.log.message(`  ROBINHOOD_TOKENS_FILE=/app/tokens.enc\n  ROBINHOOD_TOKEN_KEY=${encKey}`);

  p.log.step("docker-compose.yml example:");
  p.log.message(
    `  services:\n    agent:\n      volumes:\n        - ./tokens.enc:/app/tokens.enc:rw\n      environment:\n        ROBINHOOD_TOKENS_FILE: "/app/tokens.enc"\n        ROBINHOOD_TOKEN_KEY: "${encKey}"`,
  );

  p.log.warn(
    "Security: Only run agents you trust. A rogue agent with shell access can read the\nenv var and decrypt the tokens. See docs/SECURITY.md for details.",
  );
}
