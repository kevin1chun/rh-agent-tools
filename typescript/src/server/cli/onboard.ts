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
      message: "Where will the agent run?",
      options: [
        {
          value: "local" as const,
          label: "This machine",
          hint: "proxy starts automatically",
        },
        {
          value: "docker" as const,
          label: "Docker / remote",
          hint: "shows commands to copy-paste",
        },
      ],
    });

    if (p.isCancel(deployment)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (deployment === "docker") {
      await showDockerInstructions(binPath);
    } else {
      await startLocalProxy(binPath);
    }
  }

  // --- Done ---
  p.outro(`Done! ${agent.postInstallHint}`);
}

// ---------------------------------------------------------------------------
// Deployment helpers
// ---------------------------------------------------------------------------

async function startLocalProxy(binPath: string): Promise<void> {
  let proxyAlreadyRunning = false;
  try {
    const resp = await fetch("http://127.0.0.1:3100/health", {
      signal: AbortSignal.timeout(1000),
    });
    proxyAlreadyRunning = resp.ok;
  } catch {
    // Not running
  }

  if (proxyAlreadyRunning) {
    const restart = await p.confirm({
      message: "Auth proxy already running on :3100. Restart it?",
      initialValue: false,
    });

    if (p.isCancel(restart) || !restart) return;

    try {
      const lsof = Bun.spawnSync(["lsof", "-ti", "tcp:3100"]);
      const pids = new TextDecoder().decode(lsof.stdout).trim();
      if (pids) {
        for (const pid of pids.split("\n")) {
          process.kill(Number(pid), "SIGTERM");
        }
        await Bun.sleep(500);
      }
    } catch {
      // Best effort
    }
  }

  const proxySpinner = p.spinner();
  proxySpinner.start(proxyAlreadyRunning ? "Restarting auth proxy..." : "Starting auth proxy...");

  const proc = Bun.spawn(["bun", "run", binPath, "proxy"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.unref();

  let started = false;
  for (let i = 0; i < 5; i++) {
    await Bun.sleep(200);
    try {
      const resp = await fetch("http://127.0.0.1:3100/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (resp.ok) {
        started = true;
        break;
      }
    } catch {
      // Not ready yet
    }
  }

  if (started) {
    proxySpinner.stop(
      proxyAlreadyRunning
        ? "Auth proxy restarted on :3100 (background)."
        : "Auth proxy started on :3100 (background).",
    );
  } else {
    proxySpinner.stop("Could not start auth proxy.");
    p.log.warn("Run `robinhood-for-agents proxy` manually if needed.");
  }
}

async function showDockerInstructions(binPath: string): Promise<void> {
  const proxyToken = crypto.randomUUID();

  p.log.step("Start the auth proxy on this machine (the host):");
  p.log.message(`  export ROBINHOOD_PROXY_TOKEN="${proxyToken}"\n  bun run ${binPath} proxy`);

  p.log.step("Set these env vars in your container:");
  p.log.message(
    `  ROBINHOOD_API_PROXY=http://host.docker.internal:3100\n  ROBINHOOD_PROXY_TOKEN=${proxyToken}`,
  );

  p.log.step("Or add to docker-compose.yml:");
  p.log.message(
    `  environment:\n    ROBINHOOD_API_PROXY: "http://host.docker.internal:3100"\n    ROBINHOOD_PROXY_TOKEN: "${proxyToken}"`,
  );

  const startNow = await p.confirm({
    message: "Start the auth proxy now?",
    initialValue: true,
  });

  if (!p.isCancel(startNow) && startNow) {
    const proxySpinner = p.spinner();
    proxySpinner.start("Starting auth proxy...");

    const proc = Bun.spawn(["bun", "run", binPath, "proxy"], {
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, ROBINHOOD_PROXY_TOKEN: proxyToken },
    });
    proc.unref();

    let started = false;
    for (let i = 0; i < 5; i++) {
      await Bun.sleep(200);
      try {
        const resp = await fetch("http://127.0.0.1:3100/health", {
          signal: AbortSignal.timeout(1000),
        });
        if (resp.ok) {
          started = true;
          break;
        }
      } catch {
        // Not ready yet
      }
    }

    if (started) {
      proxySpinner.stop("Auth proxy started on :3100 (background).");
    } else {
      proxySpinner.stop("Could not start auth proxy.");
      p.log.warn("Start it manually with the commands above.");
    }
  }

  p.log.info(
    "The proxy token above is required — without it, the container gets 403 on every API call.",
  );
}
