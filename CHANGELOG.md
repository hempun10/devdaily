# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/hempun10/devdaily/releases/tag/v0.2.0
[0.1.0]: https://github.com/hempun10/devdaily/releases/tag/v0.1.0
