/**
 * docker-setup: print instructions for Docker auth proxy configuration.
 *
 * The old approach of mounting token files is deprecated. The auth proxy
 * is the recommended way to provide Robinhood API access to containers.
 */

export async function runDockerSetup(_argv: string[]): Promise<void> {
  console.log(`Docker setup for robinhood-for-agents
─────────────────────────────────────

The recommended approach is the auth proxy. Tokens stay on the host;
the container only needs the proxy URL.

1. Start the auth proxy on the host:

   bunx robinhood-for-agents proxy --port 3100

2. Set one env var in your container:

   docker run -e ROBINHOOD_API_PROXY=http://host.docker.internal:3100 ...

   Or in docker-compose.yml:

   services:
     your-service:
       environment:
         ROBINHOOD_API_PROXY: "http://host.docker.internal:3100"

See docs/DOCKER.md and docs/SECURITY.md for details.`);
}
