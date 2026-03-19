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

### Step 2: Browser Login
```bash
bunx robinhood-for-agents login
```
This opens Chrome to the real Robinhood website:
1. Chrome opens to robinhood.com/login
2. User enters email and password
3. Robinhood handles MFA natively (push notification, SMS, etc.)
4. Token captured automatically and saved securely
5. Chrome closes when login is complete

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

## Security Warning
After successful login, **always** remind the user:

> **Robinhood OAuth tokens are stored in the OS keychain (macOS Keychain Services, Linux libsecret, Windows Credential Manager) via Bun.secrets. No tokens are written to disk. Tokens expire after ~24 hours. Anyone with access to this machine's keychain can read them.**

## Notes
- No credentials (username/password) pass through the tool layer — login happens on the real Robinhood website
- Requires Google Chrome installed on the system
- Tokens expire after ~24h; the client auto-refreshes before requiring re-auth
