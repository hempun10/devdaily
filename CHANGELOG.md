# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-02-14

### Fixed

- **Jira ADF Description Crash** — `ticket.description.trim is not a function` when using Jira Cloud API v3. Jira returns `description` as an Atlassian Document Format (ADF) object, not a plain string. Added `extractAdfText()` recursive parser to convert ADF trees to plain text.
- **Defensive Description Handling** — Added `typeof` guards before calling string methods on `ticket.description` in `formatForPrompt()`, `formatTicketForContext()`, and `formatTicketContext()` to prevent crashes from any non-string description values.
- **Silent PM Fetch Failures** — `fetchTickets()` had a bare `catch {}` that returned `[]` on any error, making PM integration failures invisible. Now logs diagnostic info when `--debug` flag is active.

### Added

- **PM Integration Test Suite** — End-to-end test scripts for GitHub Issues and Linear integrations:
  - `scripts/setup-test-repo.sh` — Creates a disposable GitHub repo with issues, source files, and initial commit
  - `scripts/setup-test-commits.sh` — Creates branches, commits, and PRs referencing both GitHub and Linear ticket IDs
  - `scripts/create-linear-issues.py` — Creates matching Linear issues via GraphQL API
- **PM Integration Test Report** — Comprehensive test report at `docs/reports/PM_INTEGRATION_TEST_REPORT.md` documenting test matrix, results, bugs found, and fixes applied across GitHub Issues, Linear, and Jira
- **Debug Logging for Ticket Fetching** — `--debug` flag now surfaces `[fetchTickets]` messages showing PM client configuration status, fetch progress, and errors
- **`debug` option in `StandupContextOptions`** — Passed through from both `standup` and `week` commands to enable ticket fetch diagnostics

### Changed

- Updated `docs/TESTING.md` with PM integration testing section, setup instructions, verification checklist, and troubleshooting guide

## [0.3.0] - 2026-02-14

### Added

- **Context Analyzer** - Smart work context extraction from git activity
  - Branch → Ticket correlation (JIRA-123, #123, LINEAR-123 patterns)
  - Work categorization (frontend, backend, infra, docs, tests, config)
  - Time-based work session tracking
- **Enhanced Standup Context** - `--context` flag shows detailed work analysis
- **JSON Schema for IDE** - Autocomplete support in `.devdaily.json` config files
- **PR Config Defaults** - Set default reviewers, assignees, and labels in config
- **Standup Scheduling** - Configure standup schedule and grouping options

### Changed

- Config now includes `$schema` reference for IDE autocomplete
- Standup generation uses work categories and ticket context for better AI summaries
- Expanded PR and standup config options (defaultReviewers, defaultLabels, groupBy, etc.)

### Technical

- New `src/core/context-analyzer.ts` for rich context extraction
- Added `schemas/devdaily.schema.json` for config validation
- Updated config schema with more standup/PR options

## [0.2.0] - 2026-02-13

### Added

- **PR Template Support** - Auto-detect and parse `.github/PULL_REQUEST_TEMPLATE.md`
- **AI Template Filling** - Copilot fills template sections based on commit analysis
- **PR Preview** - Terminal markdown rendering with `--preview` flag
- **Interactive PR Mode** - Select labels, reviewers, assignees with `--interactive`
- **Slack Notifications** - Send standups to Slack via webhooks with `--slack`
- **Discord Notifications** - Send standups to Discord via webhooks with `--discord`
- **Config Management** - New `devdaily config` command for managing settings
- **Init Wizard** - Interactive setup with `devdaily init` command
- **Notifications Setup** - `devdaily init --notifications` for webhook configuration
- **Doctor Command** - `devdaily doctor` to diagnose and fix setup issues
- **Dashboard Command** - `devdaily dash` for quick status overview (stub)
- **Project Management Integration** - Jira, Linear, Notion support (stub)
- **Secrets Management** - Secure storage for API keys and webhooks
- **Custom UI System** - Enhanced terminal UI with colors, ASCII art, and help rendering

### Changed

- Upgraded to new GitHub Copilot CLI (`copilot -p --silent`)
- Improved PR description generation with template awareness
- Better error handling and user feedback
- Enhanced standup formatting for notification channels

### Fixed

- TypeScript strict mode compliance
- Unused variable warnings in doctor and github modules

## [0.1.0] - 2026-02-12

### Added

- Initial release of DevDaily AI
- `standup` command - Generate daily standup notes from git commits
- `pr` command - Generate PR descriptions with interactive preview
- `week` command - Generate weekly work summaries
- `context` command - Recover work context (stub)
- Commitlint integration for smart PR title generation
- Interactive PR workflow (preview, create, draft)
- Auto-copy to clipboard for all outputs
- Multiple output formats (markdown, slack, plain)
- Professional terminal UI (chalk, boxen, ora)
- Comprehensive test suite (9 tests)
- GitHub Actions CI/CD
- Husky pre-commit hooks
- ESLint + Prettier formatting
- TypeScript strict mode

### Features

- GitHub Copilot CLI integration for AI-powered summaries
- Conventional commit parsing
- Issue number extraction from commits
- PR type categorization (feature, bugfix, breaking)
- Support for custom date ranges
- No emoji output (professional terminal style)

[0.4.1]: https://github.com/hempun10/devdaily/releases/tag/v0.4.1
[0.3.0]: https://github.com/hempun10/devdaily/releases/tag/v0.3.0
[0.2.0]: https://github.com/hempun10/devdaily/releases/tag/v0.2.0
[0.1.0]: https://github.com/hempun10/devdaily/releases/tag/v0.1.0
