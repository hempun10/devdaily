# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2026-02-15

### Fixed

- **Slack webhook formatting** — Standup messages sent to Slack via `--send` / `--slack` now correctly render bold, italic, and other formatting. Previously, raw Markdown syntax (e.g. `**bold**`) was sent directly into Slack's `mrkdwn` blocks, which don't support double-asterisk bold. The notification pipeline now converts Markdown → Slack mrkdwn format using the existing `formatOutput()` formatter before sending, so `**text**` becomes `*text*`, `*italic*` becomes `_italic_`, headers become bold lines, and links use Slack's `<url|text>` syntax.

## [0.5.0] - 2025-07-13

### Added

- **Persistent Work Journal** — Local work memory stored in `~/.config/devdaily/journal/` that tracks your work across sessions, days, and projects.
  - `src/core/work-journal.ts` — Full storage layer with index, search, merge, cross-project aggregation, pruning, and stats.
  - `src/core/snapshot-builder.ts` — Captures rich repo state (branches, commits, PRs, tickets, diffs, categories) into `WorkSnapshot` objects.

- **`devdaily snapshot`** (`snap`, `save`) — Manually capture a work snapshot with notes and tags.
  - `--light` mode for fast captures (no PRs/tickets).
  - `--list [days]` to browse recent snapshots.
  - `--stats` to see journal storage usage.
  - `--prune <days>` to clean up old entries.

- **`devdaily context`** (`ctx`, `resume`) — Recover what you were working on after a context switch.
  - Date range filtering (`--from`, `--to`, `--date`, `--days`).
  - `--all-projects` for cross-project context.
  - `--ai` for AI-powered "where did I leave off?" summaries.
  - `--branches` for detailed active branch status.

- **`devdaily recall`** (`search`, `find`) — Search your work history by keyword, file, tag, or date range.
  - Fuzzy matching across commit messages, branch names, notes, and tags.
  - `--file <path>` to find when a specific file was changed.
  - `--ai` for AI-powered search result summaries.
  - `--json` output for scripting.

- **Automatic Side-Effect Snapshots** — Zero-friction snapshot capture.
  - `src/core/auto-snapshot.ts` — Silent, non-blocking snapshot module.
  - `sideEffectSnapshot()` runs at the end of `standup`, `pr`, and `week` commands.
  - `fireAndForgetSnapshot()` for fully async background captures.
  - Tagged with source (`auto:standup`, `auto:pr`, `auto:week`, etc.).
  - Respects `journal.autoSnapshot` config flag.
  - `--no-journal` flag on `standup` and `pr`, `--no-auto-snapshot` on `week` to skip.

- **Git Hooks for Auto-Capture** — Opt-in `post-commit` and `post-checkout` hooks.
  - `devdaily init --git-hooks` — Interactive hook installer.
  - `devdaily init --remove-hooks` — Clean removal of devdaily hooks.
  - POSIX-compatible (`#!/bin/sh`), background-executed, safe with existing hooks.
  - Appends to existing hooks rather than overwriting.
  - `generatePostCommitHook()` and `generatePostCheckoutHook()` in `auto-snapshot.ts`.

- **`journal` Config Section** — New configuration block for snapshot automation.
  - `autoSnapshot` (default: `true`) — Enable/disable side-effect snapshots globally.
  - `gitHooks` (default: `false`) — Track whether git hooks are installed.
  - `hooks.postCommit` / `hooks.postCheckout` — Per-hook enable/disable.
  - `quiet` (default: `true`) — Suppress snapshot side-effect messages.

- **Enhanced `devdaily week`** — Major improvements to weekly summaries.
  - `--from` / `--to` for custom date ranges.
  - `--weeks-ago <n>` for relative week selection.
  - `--all-projects` for cross-project summaries from journal data.
  - `--save` to persist the AI summary to the journal.
  - `--json` for machine-readable stats output.
  - Journal enrichment — weekly summaries incorporate snapshot history.

- **Comprehensive Test Suite** — 654 tests across 12 test files.
  - `tests/auto-snapshot.test.ts` — 74 tests covering side-effect snapshots, hook generation, hook install/remove, config integration, edge cases, and round-trip cycles.
  - `tests/work-journal.test.ts` — 123 tests covering persistent storage, search, cross-project aggregation, merge logic, pruning, and stats.

- **Production-Grade README** — Complete rewrite with full command reference, config documentation, architecture overview, testing guide, FAQ, and troubleshooting.

### Changed

- **`devdaily init`** — Added `📸 Git hooks for automatic snapshots` as an interactive setup option, `--git-hooks` and `--remove-hooks` flags, and `dd context` in quick-start hints.
- **`devdaily standup`** — Now auto-saves a light snapshot to the journal after generating (disable with `--no-journal`).
- **`devdaily pr`** — Now auto-saves a light snapshot to the journal after generating (disable with `--no-journal`).
- **`devdaily week`** — Now auto-saves a light snapshot to the journal after generating (disable with `--no-auto-snapshot`).
- **Config schema** — Added `JournalSchema` with `autoSnapshot`, `gitHooks`, `hooks`, `autoPromptDays`, and `quiet` fields. Exported `Journal` type.
- **README** — Rewritten from scratch to production-grade standard. Updated project structure, feature table, command reference, config examples, roadmap (marked completed items), and added sections for auto-snapshots, privacy, and testing.

### Technical

- New modules: `src/core/auto-snapshot.ts`, `src/core/snapshot-builder.ts`, `src/core/work-journal.ts`.
- New commands: `src/commands/snapshot.ts`, `src/commands/context.ts`, `src/commands/recall.ts`.
- New test file: `tests/auto-snapshot.test.ts` (74 tests).
- Total test count: 580 → 654 (12 test files).
- Build output: 348 KB (ESM), clean TypeScript compilation with zero errors.

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

[0.5.0]: https://github.com/hempun10/devdaily/releases/tag/v0.5.0
[0.4.1]: https://github.com/hempun10/devdaily/releases/tag/v0.4.1
[0.3.0]: https://github.com/hempun10/devdaily/releases/tag/v0.3.0
[0.2.0]: https://github.com/hempun10/devdaily/releases/tag/v0.2.0
[0.1.0]: https://github.com/hempun10/devdaily/releases/tag/v0.1.0
