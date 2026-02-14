# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in DevDaily, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to the maintainers or use [GitHub's private vulnerability reporting](https://github.com/hempun10/devdaily/security/advisories/new).

### What to include

- A description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Any suggested fixes (optional)

### What to expect

- **Acknowledgment** within 48 hours of your report.
- **Status update** within 7 days with an assessment and expected timeline.
- **Fix release** as soon as practical, depending on severity.
- **Credit** in the release notes (unless you prefer to remain anonymous).

## Scope

The following are in scope for security reports:

- **Secrets leakage** — API tokens, webhook URLs, or credentials being logged, exposed, or written to unintended locations.
- **Path traversal** — reading or writing files outside of expected directories.
- **Command injection** — unsanitized user input passed to shell commands or `execa`.
- **Dependency vulnerabilities** — known CVEs in direct dependencies.

The following are out of scope:

- Issues in GitHub Copilot CLI itself (report to GitHub).
- Social engineering attacks.
- Denial of service via CLI input (DevDaily is a local CLI tool, not a server).

## Security Design

DevDaily is designed with the following security principles:

- **Local-first.** All journal data stays on your machine at `~/.config/devdaily/journal/`. No data is sent to any DevDaily server.
- **Secrets separation.** API tokens and webhook URLs are stored in `.devdaily.secrets.json` (auto-added to `.gitignore`) or in `~/.config/devdaily/secrets.json`, separate from configuration.
- **Minimal AI context.** Only commit messages, branch names, and diff summaries are sent to GitHub Copilot CLI. Full file contents are never included in prompts.
- **Opt-in integrations.** Git hooks, Slack/Discord webhooks, and PM tool connections are all opt-in and require explicit setup.
- **No telemetry.** DevDaily does not collect usage data or phone home.

## Dependencies

We monitor dependencies for known vulnerabilities using `npm audit`. If you find a vulnerable dependency, please report it as described above or open a regular issue if the vulnerability is already public.
