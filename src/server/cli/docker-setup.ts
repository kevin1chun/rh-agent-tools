/**
 * docker-setup: export encrypted tokens for Docker container use.
 *
 * Encrypts tokens from the OS keychain into an encrypted file,
 * then copies the encryption key to the clipboard.
 */

import { execSync } from "node:child_process";
import { EncryptedFileTokenStore, KeychainTokenStore } from "../../client/token-store.js";

/** Copy text to the OS clipboard. Throws if clipboard is unavailable. */
function copyToClipboard(text: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execSync("pbcopy", { input: text, stdio: ["pipe", "pipe", "pipe"] });
  } else if (platform === "linux") {
    try {
      execSync("xclip -selection clipboard", { input: text, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      execSync("xsel --clipboard --input", { input: text, stdio: ["pipe", "pipe", "pipe"] });
    }
  } else {
    throw new Error(`Clipboard not supported on platform: ${platform}`);
  }
}

export async function runDockerSetup(_argv: string[]): Promise<void> {
  console.log("Docker setup for robinhood-for-agents");
  console.log("─────────────────────────────────────\n");

  // 1. Load tokens from keychain
  const keychain = new KeychainTokenStore();
  const tokens = await keychain.load();
  if (!tokens) {
    console.error("No tokens found in OS keychain. Run 'robinhood-for-agents onboard' first.");
    process.exit(1);
  }

  // 2. Generate encryption key and write encrypted file
  const outputPath = "./tokens.enc";
  const store = new EncryptedFileTokenStore(outputPath);
  await store.save(tokens);

  // 3. Read back the encryption key (was auto-generated and stored in keychain)
  const encKeyRaw = await Bun.secrets.get("robinhood-for-agents", "encryption-key");
  const encKey = encKeyRaw ?? process.env.ROBINHOOD_TOKEN_KEY ?? "";

  if (!encKey) {
    console.error("Error: Could not retrieve encryption key.");
    process.exit(1);
  }

  // 4. Copy key to clipboard
  try {
    copyToClipboard(encKey);
  } catch {
    console.error(
      "Error: Cannot copy encryption key to clipboard.\n" +
        "Install pbcopy (macOS) or xclip/xsel (Linux) and retry.",
    );
    process.exit(1);
  }

  console.log(`Tokens encrypted to: ${outputPath}`);
  console.log("\n✓ Encryption key copied to clipboard. Paste it into your Docker config.\n");
  console.log("Set these env vars in your container:\n");
  console.log("  ROBINHOOD_TOKENS_FILE=/path/to/tokens.enc");
  console.log("  ROBINHOOD_TOKEN_KEY=<paste from clipboard>\n");
  console.log("docker-compose.yml example:\n");
  console.log(`  services:
    agent:
      volumes:
        - ./tokens.enc:/app/tokens.enc:rw
      environment:
        ROBINHOOD_TOKENS_FILE: "/app/tokens.enc"
        ROBINHOOD_TOKEN_KEY: "<paste from clipboard>"\n`);
  console.log("Token refresh will write re-encrypted tokens back to the file automatically.");
  console.log("\n⚠️  Security: Only run agents you trust. A rogue agent with shell access");
  console.log("can read the env var and decrypt the tokens. See docs/SECURITY.md.");
}
