# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report security vulnerabilities via [GitHub Security Advisories](https://github.com/kevin1chun/robinhood-for-agents/security/advisories/new) with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive an acknowledgment within 48 hours and a detailed response within 7 days.

## Scope

**In scope:**
- Token or credential leakage
- Encryption weaknesses in token storage (`~/.robinhood-for-agents/tokens.enc`)
- Unauthorized order execution or account access
- Bypassing safety controls (blocked operations, parameter validation)

**Out of scope:**
- Vulnerabilities in the Robinhood API itself
- Issues requiring physical access to the user's machine
- Social engineering

## Security Design

This project follows a defense-in-depth approach:

- Sessions encrypted with AES-256-GCM, key stored in OS keychain
- Fund transfers and bank operations are permanently blocked
- Bulk cancel operations are blocked
- All order placements require explicit parameters with no dangerous defaults
- Sessions expire after ~24 hours

See [docs/ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk model.
