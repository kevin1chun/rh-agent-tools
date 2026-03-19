# Docker (OpenClaw, etc.)

**TL;DR** -- Tokens stay on the host. The container connects through an auth proxy. No tokens, keys, or credentials inside the container.

---

## The constraint

| Where | Keychain? |
|-------|-----------|
| **Host (Mac/Linux)** | Yes. Login + tokens live here. |
| **Container** | No. Different OS; no API to your host keychain. |

OpenClaw and other agents running in Docker execute skill code via `bun` directly -- calling `getClient()` -> `restoreSession()`. The client library needs to reach the Robinhood API with valid auth.

**The wrong approach**: mounting token files or passing tokens as env vars. A rogue agent can read either in one command. See [SECURITY.md](./SECURITY.md) for detailed attack scenarios.

**The right approach**: an auth proxy on the host that holds the tokens and injects auth headers. The container only knows the proxy URL.

---

## How the auth proxy works

```
┌─── Host ──────────────────────┐    ┌─── Container ──────────────────┐
│                               │    │                                │
│ Keychain: has tokens          │    │ Keychain: empty                │
│ Proxy: listens on :3100      │<───│ Client: talks to proxy         │
│                               │    │                                │
│ Proxy receives request        │    │ No tokens on filesystem        │
│ -> validates proxy token      │    │ No RH tokens in env vars       │
│ -> adds Bearer header         │    │                                │
│ -> forwards to Robinhood API  │    │                                │
│ -> strips tokens from resp    │    │                                │
│ -> returns response           │    │                                │
└───────────────────────────────┘    └────────────────────────────────┘
```

The proxy:
- Loads tokens from the host keychain via `Bun.secrets`
- Forwards API requests via path prefixes: `/rh/*` -> `api.robinhood.com`, `/nummus/*` -> `nummus.robinhood.com`
- Injects the Bearer header on every upstream request
- Handles token refresh transparently (on 401, refreshes and retries)
- Never exposes raw tokens in responses
- Allowlists headers to prevent container metadata leaking upstream

---

## Setup

### Guided (recommended)

Run the onboard command and select "Docker / remote" when asked where the agent runs:

```bash
npx robinhood-for-agents onboard
```

The setup will:
1. Register the MCP server and install skills (if applicable)
2. Open Chrome for Robinhood login
3. Generate a proxy token and print copy-paste commands for your container
4. Optionally start the auth proxy in the background

### Manual (step by step)

#### 1. Login on the host

```bash
npx robinhood-for-agents onboard
```

Complete the interactive setup. This opens Chrome, captures OAuth tokens, and stores them in the OS keychain.

#### 2. Start the auth proxy

```bash
export ROBINHOOD_PROXY_TOKEN="$(uuidgen)"
npx robinhood-for-agents proxy --port 3100
```

`ROBINHOOD_PROXY_TOKEN` sets a known proxy access token so you can pass the same value to the container. If omitted, the proxy generates a random UUID and stores it in the OS keychain (useful for local multi-process setups, but not for Docker since the container has no keychain access).

The proxy binds to `127.0.0.1` by default. Use `--host 0.0.0.0` if the container cannot reach `host.docker.internal`.

#### 3. Verify the proxy is running

```bash
curl http://localhost:3100/health   # {"status":"ok"}
```

#### 4. Configure your container

Set two env vars in your Docker Compose or `docker run`:

```yaml
# docker-compose.yml
services:
  openclaw-gateway:
    image: your-gateway-image
    environment:
      ROBINHOOD_API_PROXY: "http://host.docker.internal:3100"
      ROBINHOOD_PROXY_TOKEN: "${ROBINHOOD_PROXY_TOKEN}"  # same value as step 2
```

Or with `docker run`:

```bash
docker run \
  -e ROBINHOOD_API_PROXY=http://host.docker.internal:3100 \
  -e ROBINHOOD_PROXY_TOKEN="$ROBINHOOD_PROXY_TOKEN" \
  your-gateway-image
```

`ROBINHOOD_API_PROXY` tells the client where the proxy is. `ROBINHOOD_PROXY_TOKEN` authenticates requests to the proxy -- all non-health endpoints require it via the `X-Proxy-Token` header. Without it, the container gets 403 on every API call.

---

## What the container sees

```bash
# Inside the container:
$ env | grep ROBINHOOD
ROBINHOOD_API_PROXY=http://host.docker.internal:3100
ROBINHOOD_PROXY_TOKEN=<user-chosen-uuid>
# Proxy token grants API access, but NOT raw RH tokens. No keys.

$ find / -name "*.json" -exec grep -l "access_token" {} \;
# (nothing)
```

---

## Proxy endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | None | Health check, returns `{"status":"ok"}` |
| `/reload-tokens` | POST | `X-Proxy-Token` | Reload tokens from keychain (after browser login) |
| `/logout` | POST | `X-Proxy-Token` | Revoke token + clear keychain |
| `/rh/*` | any | `X-Proxy-Token` | Forward to `api.robinhood.com/*` with auth |
| `/nummus/*` | any | `X-Proxy-Token` | Forward to `nummus.robinhood.com/*` with auth |

All endpoints except `/health` require the `X-Proxy-Token` header. Requests without it receive a 403 response.

---

## Stopping access

Kill the proxy on the host -> the container immediately loses all Robinhood API access. No tokens to revoke, no files to delete.

---

## Local mode (no Docker)

When running locally (no `ROBINHOOD_API_PROXY` env var), the proxy auto-starts in-process on `127.0.0.1:3100` when the MCP server launches or when `restoreSession()` is first called. This provides the same proxy architecture without requiring a separate process.

## Python SDK

The Python SDK uses the same auth proxy. In local mode, it auto-discovers the proxy at `127.0.0.1:3100`. In Docker, set `ROBINHOOD_API_PROXY` and `ROBINHOOD_PROXY_TOKEN` as env vars (same as the TypeScript SDK). The Python SDK does not access the keychain directly — all auth is proxy-mediated.

---

## Why not token files?

Mounting a token file (plaintext or encrypted) into the container means a rogue agent or prompt injection can exfiltrate the credentials in one command:

```bash
$ cat /secrets/robinhood-tokens.json   # plaintext: instant theft
$ env | grep ENCRYPTION_KEY            # encrypted: key is right here
```

The auth proxy avoids this entirely -- there's nothing to steal. See [SECURITY.md](./SECURITY.md) for the full threat model.
