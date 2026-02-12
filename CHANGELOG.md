# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/hempun10/devdaily/releases/tag/v0.1.0
