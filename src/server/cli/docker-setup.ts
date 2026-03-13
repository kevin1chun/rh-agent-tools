/**
 * docker-setup: write tokens to a file and print Docker volume + env snippet.
 */

import { resolve } from "node:path";
import { writeTokensToFile } from "./token-export.js";

const DEFAULT_OUT = "robinhood-docker-tokens.json";
const CONTAINER_PATH = "/secrets/robinhood-tokens.json";

function parseOutPath(argv: string[]): string {
  const idx = argv.findIndex((a) => a === "--out" || a === "-o");
  const next = idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
  return next ? resolve(next) : resolve(process.cwd(), DEFAULT_OUT);
}

function dockerSnippet(hostPath: string): string {
  const envLine =
    "      ROBINHOOD_TOKENS_FILE: ${ROBINHOOD_TOKENS_FILE:-" + CONTAINER_PATH + "}";
  const volumeLine =
    "      - ${ROBINHOOD_TOKEN_FILE_HOST:-" + hostPath + "}:" + CONTAINER_PATH + ":ro";
  return `
# Add to your gateway service in docker-compose.yml:
    environment:
${envLine}
    volumes:
${volumeLine}

# Or for docker run:
  -v "${hostPath}:${CONTAINER_PATH}:ro" \\
  -e ROBINHOOD_TOKENS_FILE=${CONTAINER_PATH}
`;
}

export async function runDockerSetup(argv: string[]): Promise<void> {
  const outPath = parseOutPath(argv);
  const ok = await writeTokensToFile(outPath);
  if (!ok) {
    console.error("Not logged in. Run robinhood-for-agents login first.");
    process.exit(1);
  }
  console.log(`Tokens written to ${outPath} (chmod 600)`);
  console.log(dockerSnippet(outPath));
}
