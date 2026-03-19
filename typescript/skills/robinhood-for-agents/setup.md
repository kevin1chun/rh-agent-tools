# Setup — Authentication Workflow

### Step 1: Check Session
```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
try { await rh.restoreSession(); console.log("logged_in"); }
catch { console.log("not_authenticated"); }
'
```
If `logged_in` — already authenticated, stop. Otherwise continue.

`restoreSession()` auto-starts a local auth proxy on `:3100` that injects tokens from the OS keychain into API requests. The client never handles tokens directly.

### Step 2: Browser Login
```bash
bunx robinhood-for-agents onboard
```
This runs the interactive setup — it will open Chrome to the real Robinhood website for login:
1. Chrome opens to robinhood.com/login
2. User enters email and password
3. Robinhood handles MFA natively (push notification, SMS, etc.)
4. Token captured automatically and saved to OS keychain
5. Chrome closes when login is complete
6. Auth proxy is started on `:3100`

### Step 3: Verify
```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
const acct = await rh.getAccountProfile();
console.log(JSON.stringify(acct, null, 2));
'
```
Confirm to the user that authentication is complete.

## Troubleshooting
- **Port 3100 conflict**: Another process on `:3100` — kill it or run `robinhood-for-agents proxy --port N`
- **`not_authenticated` after login**: Try `bunx robinhood-for-agents onboard` to re-login and restart the proxy
- **Proxy not running**: `restoreSession()` auto-starts it, but you can also run `robinhood-for-agents proxy` manually

## Notes
- No credentials (username/password) pass through the tool layer — login happens on the real Robinhood website
- Tokens are stored in the OS keychain via `Bun.secrets` — never on disk
- Tokens expire after ~24h; the client auto-refreshes before requiring re-auth
- All API calls route through the local auth proxy (`:3100`) which injects Bearer tokens — the agent never sees tokens
