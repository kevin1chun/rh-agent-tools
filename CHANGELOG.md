# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-10

### Added

- **Token refresh flow** using `refresh_token` + `device_token` with `expires_in: 734000` (~8.5 days, matching pyrh). Sessions last significantly longer before requiring browser re-login.
- Detailed encrypt/decrypt flow diagrams in `ARCHITECTURE.md`
- Authentication section in `CLAUDE.md` documenting browser auth mechanism

### Fixed

- **device_token capture** in browser login — Robinhood's frontend sends OAuth requests as JSON, not form-urlencoded. The interceptor now parses JSON first, correctly capturing `device_token`.
- **Release workflow** — added `setup-node` with `registry-url` for npm authentication

### Changed

- README prerequisites clarified: Google Chrome is required by `playwright-core` (no bundled browser)
- Removed `robin_stocks` migration context from `ARCHITECTURE.md`
- Removed OpenClaw MCP bridge references from README

## [0.1.0] - 2026-03-10

### Added

- **MCP Server** with 18 structured tools for any MCP-compatible AI agent
- **Standalone client library** (`rh-for-agents`) with ~50 async methods
- **5 Claude Code skills**: setup, portfolio, research, trade, options
- Browser-based authentication via Playwright (Chrome)
- AES-256-GCM encrypted session storage with OS keychain key management
- Multi-account support (first-class across all account-scoped methods)
- Interactive onboarding TUI (`rh-for-agents onboard`)
- One-command install for Claude Code (`rh-for-agents install`)
- Safety controls: blocked fund transfers, blocked bulk cancels, explicit order parameters
- Support for Claude Code, Codex, and OpenClaw agents

[0.2.0]: https://github.com/kevin1chun/rh-for-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kevin1chun/rh-for-agents/releases/tag/v0.1.0
