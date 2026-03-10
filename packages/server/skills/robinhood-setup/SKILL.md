---
name: robinhood-setup
description: Set up Robinhood authentication. Use when user needs to log in or connect to Robinhood.
allowed-tools: mcp__rh-for-agents__*
---

# robinhood-setup

Setup Robinhood authentication via browser-based login.

## Triggers
- "setup robinhood"
- "connect to robinhood"
- "robinhood login"
- "configure robinhood"

## Instructions

### Step 1: Check if Already Authenticated
Call `rh-for-agents:robinhood_check_session` (no parameters).

- If it returns `status: "logged_in"` — the user is already authenticated. Tell them and stop.
- If it returns `status: "not_authenticated"` — continue to Step 2.

### Step 2: Browser Login
Tell the user that Chrome will open to the Robinhood login page, then call `rh-for-agents:robinhood_browser_login`.

The user logs in normally on the real Robinhood website:
1. Chrome opens to robinhood.com/login
2. User enters their email and password
3. Robinhood handles MFA natively (push notification, SMS, etc.)
4. The token is captured automatically and saved securely
5. Chrome closes when login is complete

### Step 3: Verify
After successful login, call `rh-for-agents:robinhood_get_account` to verify the session works. Confirm to the user that authentication is complete and all other skills will work automatically.

## Security Warning
After successful login, **always** remind the user:

> **The session file at `~/.rh-for-agents/session.enc` contains encrypted Robinhood OAuth tokens. The encryption key is stored in the OS keychain (AES-256-GCM via node:crypto). Anyone with access to this machine can decrypt them. Tokens expire after ~24 hours. Never copy these files to untrusted locations.**

## Important Notes
- Session is encrypted at rest (AES-256-GCM via node:crypto) with the key in the OS keychain
- Tokens expire after ~24h; the client will attempt a token refresh automatically before requiring re-authentication
- No credentials (username/password) pass through the tool layer — you log in directly on the real Robinhood website
- Requires Google Chrome installed on the system
- **Do NOT use `phoenix.robinhood.com`** — it rejects TLS. Use `api.robinhood.com` endpoints only.

## MCP Tools Used
| Tool | Purpose |
|------|---------|
| `rh-for-agents:robinhood_check_session` | Check if already authenticated |
| `rh-for-agents:robinhood_browser_login` | Open Chrome for browser-based login |
| `rh-for-agents:robinhood_get_account` | Verify session works |
