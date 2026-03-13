# Docker (OpenClaw, etc.)

**TL;DR** — Keychain lives on the host. Container can’t see it. One command writes tokens to a file; you mount the file. Done.

---

## The constraint

| Where | Keychain? |
|-------|-----------|
| **Host (Mac)** | Yes. Login + tokens live here. |
| **Container** |  No. It’s a different OS; no API to your Mac keychain. |

 **Tokens stay on the host**. The container gets them by reading a **file** you mount. One write on the host, one mount in Docker.

---

## Flow (3 steps)

1. **Host:** `login` → then `docker-setup` (writes a token file + prints the exact Docker config).
2. **Paste** the printed block into your compose (or use the `docker run` flags).
3. **Restart** the gateway. Container reads from the mounted file via `ROBINHOOD_TOKENS_FILE`.

```bash
bunx robinhood-for-agents login
bunx robinhood-for-agents docker-setup
# update snippet in docker-compose config → docker compose up -d → restart gateway
```

---

## Optional: keep the file fresh

After you re-login on the host, the file is stale until you write again. Either:

- Re-run `docker-setup`, or  
- Run a **sync** in the background so the file is rewritten every N seconds from keychain:

```bash
bunx robinhood-for-agents sync-tokens --out ./robinhood-docker-tokens.json --interval 300
```

Run it in another terminal or `&`. Bind-mount that same path in the container; it stays current.

---

## Alternative: MCP on host

If your stack can call an MCP server that runs **on the host**, run `robinhood-for-agents` there. Tokens never leave the host; no file, no mount. See your agent’s docs for “MCP server on host”.
