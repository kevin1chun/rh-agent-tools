/** CLI handler for the `proxy` subcommand. */

import { startProxy } from "../proxy.js";

function parseArgs(argv: string[]): { port: number; host: string } {
  let port = 3100;
  let host = "127.0.0.1";

  const portIdx = argv.findIndex((a) => a === "--port" || a === "-p");
  if (portIdx !== -1 && argv[portIdx + 1]) {
    const n = Number.parseInt(argv[portIdx + 1] as string, 10);
    if (Number.isFinite(n) && n > 0) port = n;
  }

  const hostIdx = argv.indexOf("--host");
  if (hostIdx !== -1 && argv[hostIdx + 1]) {
    host = argv[hostIdx + 1] as string;
  }

  return { port, host };
}

export async function runProxy(argv: string[]): Promise<void> {
  const { port, host } = parseArgs(argv);
  await startProxy({ port, host });
}
