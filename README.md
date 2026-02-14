<div align="center">

# DevDaily AI

**Your AI-powered developer memory.**

Auto-generate standup notes, PR descriptions, and weekly summaries from your git history.

[![npm version](https://img.shields.io/npm/v/devdaily-ai)](https://www.npmjs.com/package/devdaily-ai)
[![CI](https://github.com/hempun10/devdaily/actions/workflows/ci.yml/badge.svg)](https://github.com/hempun10/devdaily/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/node/v/devdaily-ai)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Installation](#installation) · [Quick Start](#quick-start) · [Commands](#commands) · [Configuration](#configuration) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why DevDaily?

Developers lose hours every week writing standup notes, crafting PR descriptions, compiling weekly reports, and trying to remember what they were doing before a context switch.

DevDaily analyzes your git history, tracks your work automatically, and uses GitHub Copilot CLI to generate professional summaries — in seconds.

**Key differentiator:** DevDaily builds a **persistent local memory** of your work. Every standup you run, every PR you generate, every branch you switch — DevDaily silently records a snapshot. That means:

- `devdaily context` tells you exactly where you left off, even days later
- `devdaily recall auth` finds every time you touched authentication code
- `devdaily week` produces accurate summaries from your local journal
- Cross-project summaries work across all your repositories

No cloud. No telemetry. Everything stays in `~/.config/devdaily/journal/`.

---

## Features

| Feature               | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| **Standup Generator** | Generate daily standup notes from commits, PRs, and tickets        |
| **PR Descriptions**   | Auto-generate titles and bodies with template + commitlint support |
| **Weekly Summaries**  | Compile weekly accomplishments with stats and AI analysis          |
| **Context Recovery**  | Recover where you left off after a context switch                  |
| **Work Search**       | Search your work history by keyword, file, tag, or date            |
| **Auto-Snapshots**    | Silent work tracking as a side-effect of commands you already run  |
| **Git Hooks**         | Opt-in `post-commit` and `post-checkout` hooks for extra coverage  |
| **PM Integration**    | GitHub Issues, Jira, and Linear ticket linking                     |
| **Notifications**     | Send standups to Slack or Discord via webhooks                     |
| **Output Formats**    | Markdown, Slack, plain text, and JSON output                       |

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org) >= 18.0.0
- [Git](https://git-scm.com)
- [GitHub CLI](https://cli.github.com) (`gh`)
- [GitHub Copilot CLI extension](https://github.com/github/gh-copilot) (`gh extension install github/gh-copilot`)

### Install

```bash
npm install -g devdaily-ai
```

### Verify

```bash
devdaily --version
devdaily doctor        # Check all prerequisites
```

### GitHub Copilot CLI Setup

DevDaily uses GitHub Copilot CLI for AI-powered text generation. Set it up once:

```bash
gh auth login
gh extension install github/gh-copilot
gh copilot --version   # Verify it works
```

---

## Quick Start

```bash
# Set up aliases and shell completions
devdaily init

# Generate today's standup
devdaily standup

# Generate a PR description
devdaily pr

# See your weekly summary
devdaily week

# Recover context after a break
devdaily context

# Search your work history
devdaily recall "auth refactor"
```

With the `dd` alias (installed via `devdaily init`):

```bash
dd s              # standup
dd pr             # PR description
dd w              # weekly summary
dd ctx            # context recovery
```

---

## Commands

### Core

| Command    | Aliases            | Description                                 |
| ---------- | ------------------ | ------------------------------------------- |
| `standup`  | `s`, `su`, `daily` | Generate standup notes from recent commits  |
| `pr`       | `p`, `pull`        | Generate PR description from current branch |
| `week`     | `w`, `weekly`      | Generate weekly work summary                |
| `context`  | `ctx`, `resume`    | Recover what you were working on            |
| `recall`   | `search`, `find`   | Search your work history                    |
| `snapshot` | `snap`, `save`     | Manually capture a work snapshot            |

### Setup & Utility

| Command   | Aliases          | Description                                       |
| --------- | ---------------- | ------------------------------------------------- |
| `init`    | —                | Set up aliases, completions, hooks, notifications |
| `config`  | `cfg`            | View and edit configuration                       |
| `doctor`  | `check`, `setup` | Check system requirements                         |
| `connect` | `pm`, `link`     | Configure project management integration          |
| `dash`    | `d`, `dashboard` | Open interactive dashboard                        |

### `devdaily standup`

```bash
devdaily standup                          # Yesterday's work
devdaily standup --days 3                 # Last 3 days
devdaily standup --format plain           # Plain text (no markdown)
devdaily standup --format slack           # Slack-ready format
devdaily standup --format json            # Structured JSON
devdaily standup --ticket PROJ-123        # Include specific ticket context
devdaily standup --tone business          # Business-friendly tone
devdaily standup --send                   # Send to Slack + Discord
devdaily standup --slack                  # Send to Slack only
devdaily standup --test-webhook           # Test webhook configuration
devdaily standup --context                # Show detailed work analysis
devdaily standup --raw-context            # Output raw context (no AI)
devdaily standup --no-copy                # Don't copy to clipboard
devdaily standup --debug                  # Show full prompt and response
```

### `devdaily pr`

```bash
devdaily pr                               # Generate + interactive menu
devdaily pr --create                      # Create PR on GitHub
devdaily pr --draft                       # Create as draft PR
devdaily pr --base develop                # Compare against develop
devdaily pr --ticket PROJ-456             # Include ticket context
devdaily pr --interactive                 # Select labels, reviewers, assignees
devdaily pr --debug                       # Show AI prompt
```

### `devdaily week`

```bash
devdaily week                             # Current week
devdaily week --last                      # Last week
devdaily week --weeks-ago 2               # Two weeks ago
devdaily week --from 2025-01-01 --to 2025-01-07
devdaily week --all-projects              # Cross-project summary
devdaily week --save                      # Save summary to journal
devdaily week --json                      # Machine-readable stats
```

### `devdaily context`

```bash
devdaily context                          # Where did I leave off?
devdaily context --ai                     # AI-powered summary
devdaily context --days 14                # Look back further
devdaily context --all-projects           # All projects
devdaily context --branches               # Show active branch details
```

### `devdaily recall`

```bash
devdaily recall "auth"                    # Search for "auth" in history
devdaily recall --file src/auth.ts        # When was this file changed?
devdaily recall --tag feature             # Find snapshots tagged "feature"
devdaily recall --from 2025-01-01         # Search within date range
devdaily recall --ai                      # AI summary of results
```

### `devdaily snapshot`

```bash
devdaily snapshot                         # Capture a full snapshot
devdaily snapshot --light                 # Quick capture (no PR/ticket fetch)
devdaily snapshot --note "before refactor"
devdaily snapshot --tag release           # Tag the snapshot
devdaily snapshot --list                  # Browse recent snapshots
devdaily snapshot --stats                 # Journal storage stats
devdaily snapshot --prune 90              # Remove entries older than 90 days
```

### `devdaily init`

```bash
devdaily init                             # Interactive setup wizard
devdaily init --global                    # Global setup
devdaily init --alias                     # Set up dd alias only
devdaily init --completions               # Shell completions only
devdaily init --notifications             # Slack/Discord webhook setup
devdaily init --git-hooks                 # Install auto-snapshot hooks
devdaily init --remove-hooks              # Remove auto-snapshot hooks
```

---

## Auto-Snapshots

DevDaily captures lightweight work snapshots automatically so you never lose context:

**When snapshots happen:**

- After running `devdaily standup`, `pr`, or `week` (side-effect)
- On `git commit` and `git checkout` (opt-in via `devdaily init --git-hooks`)
- Manually via `devdaily snapshot`

**What's stored:**

- Current branch and active branches
- Today's commits (messages, files changed)
- Diff stats (insertions, deletions, files)
- Work categories (frontend, backend, infra, etc.)
- Optional notes and tags

**Disabling:**

```bash
# Per-command
devdaily standup --no-journal
devdaily week --no-auto-snapshot

# Globally
# Set journal.autoSnapshot to false in .devdaily.json
```

---

## Configuration

DevDaily uses a JSON config file with optional JSON Schema support for IDE autocomplete.

### Config file locations

| Scope               | Path                                                          |
| ------------------- | ------------------------------------------------------------- |
| Local (per-project) | `.devdaily.json`                                              |
| Global              | `~/.config/devdaily/config.json`                              |
| Secrets             | `~/.config/devdaily/secrets.json` or `.devdaily.secrets.json` |

Local config overrides global config. Secrets are stored separately and should never be committed.

### Example

```json
{
  "$schema": "https://raw.githubusercontent.com/hempun10/devdaily/main/schemas/devdaily.schema.json",

  "output": {
    "format": "markdown",
    "copyToClipboard": true,
    "showStats": true
  },

  "git": {
    "defaultBranch": "main",
    "excludePatterns": ["merge commit", "Merge branch"]
  },

  "standup": {
    "defaultDays": 1,
    "sections": ["completed", "in-progress", "blockers"],
    "includeTicketLinks": true
  },

  "pr": {
    "defaultBase": "main",
    "includeDiff": true,
    "maxDiffLines": 200,
    "titleFormat": "conventional",
    "autoLabels": true
  },

  "journal": {
    "autoSnapshot": true,
    "gitHooks": false,
    "quiet": true
  },

  "projectManagement": {
    "tool": "github",
    "ticketPrefix": "PROJ"
  },

  "notifications": {
    "slack": { "enabled": false },
    "discord": { "enabled": false }
  }
}
```

### Project management integration

DevDaily extracts ticket IDs from branch names and commit messages, then fetches metadata from your PM tool:

```bash
devdaily connect                  # Interactive setup
devdaily connect --tool jira      # Configure Jira
devdaily connect --tool linear    # Configure Linear
```

Supported tools: **GitHub Issues** (default, uses `gh` CLI), **Jira** (REST API v3), **Linear** (GraphQL API).

### Custom PR prompt file

Create a `.devdaily-pr-prompt.md` file in your repo to customize how PR descriptions are generated:

```markdown
## PR Description Guidelines

- Use present tense ("Add feature" not "Added feature")
- Reference ticket numbers
- Include a testing section
- Keep descriptions concise
```

Search order: `.devdaily-pr-prompt.md` → `.github/devdaily-pr-prompt.md` → `docs/devdaily-pr-prompt.md`

---

## Privacy & Security

- **All data stays local.** Journal entries are stored in `~/.config/devdaily/journal/` — nothing is sent to any server.
- **Secrets are stored separately** in `.devdaily.secrets.json` (auto-added to `.gitignore`) or `~/.config/devdaily/secrets.json`.
- **Git hooks are opt-in** and POSIX-compatible. They append to existing hooks instead of overwriting.
- **AI generation** uses GitHub Copilot CLI, which processes your prompts through GitHub's infrastructure under your existing Copilot agreement.

---

## Development

### Prerequisites

- Node.js >= 18
- npm >= 9
- Git

### Setup

```bash
git clone https://github.com/hempun10/devdaily.git
cd devdaily
npm install
```

### Common tasks

```bash
npm run dev              # Watch mode (auto-rebuild)
npm run build            # Production build (tsup)
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check
npm test                 # Run all tests (vitest)
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Tests with coverage report
```

### Project structure

```
devdaily/
├── src/
│   ├── commands/          # CLI command handlers
│   │   ├── standup.ts     # Standup generation
│   │   ├── pr.ts          # PR description generation
│   │   ├── week.ts        # Weekly summary
│   │   ├── context.ts     # Context recovery
│   │   ├── recall.ts      # Work history search
│   │   ├── snapshot.ts    # Manual snapshot capture
│   │   ├── init.ts        # Setup wizard
│   │   ├── config.ts      # Configuration management
│   │   ├── doctor.ts      # System diagnostics
│   │   ├── connect.ts     # PM tool connection
│   │   └── dash.ts        # Interactive dashboard
│   ├── core/              # Business logic
│   │   ├── git-analyzer.ts        # Git operations (simple-git)
│   │   ├── copilot.ts             # GitHub Copilot CLI integration
│   │   ├── standup-context.ts     # Rich context builder for standups
│   │   ├── context-analyzer.ts    # Work pattern analysis
│   │   ├── snapshot-builder.ts    # Snapshot creation
│   │   ├── work-journal.ts       # Persistent local storage
│   │   ├── auto-snapshot.ts      # Side-effect & hook snapshots
│   │   ├── notifications.ts     # Slack/Discord webhooks
│   │   ├── project-management.ts # Jira/Linear/GitHub Issues
│   │   ├── pr-template.ts       # PR template detection
│   │   ├── pr-prompt.ts         # Custom prompt file loader
│   │   ├── github.ts            # GitHub API helpers
│   │   └── github-repo.ts       # Repo metadata
│   ├── config/            # Configuration loading & schema
│   ├── ui/                # Terminal UI (colors, ASCII, help)
│   ├── utils/             # Helpers (clipboard, formatting, commitlint)
│   ├── types/             # TypeScript type definitions
│   └── index.ts           # CLI entry point
├── tests/                 # Vitest test suites
├── schemas/               # JSON Schema for config validation
├── examples/              # Example command outputs
├── docs/                  # Additional documentation
└── .github/               # CI workflows and templates
```

### Tech stack

| Category           | Technology                   |
| ------------------ | ---------------------------- |
| Language           | TypeScript 5.7 (strict mode) |
| Runtime            | Node.js 18+ (ESM)            |
| CLI framework      | Commander.js 12              |
| Git operations     | simple-git                   |
| AI generation      | GitHub Copilot CLI           |
| Terminal UI        | chalk, boxen, ora, inquirer  |
| Build              | tsup                         |
| Testing            | Vitest                       |
| Linting            | ESLint + Prettier            |
| Commit conventions | commitlint + Husky           |

---

## Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

### Test coverage

| Module               | Tests   | Description                              |
| -------------------- | ------- | ---------------------------------------- |
| `auto-snapshot`      | 74      | Side-effect snapshots, hooks, config     |
| `work-journal`       | 123     | Persistent storage, search, aggregation  |
| `project-management` | 130     | Jira, Linear, GitHub Issues integration  |
| `standup-context`    | 70      | Context building, formatting             |
| `notifications`      | 70      | Slack/Discord webhooks, output formatter |
| `pr-creation`        | 123     | PR generation pipeline                   |
| `copilot`            | 38      | AI prompt building                       |
| `pr-prompt`          | 26      | Custom prompt file loading               |
| `pr-template`        | 25      | Template detection and parsing           |
| `context-analyzer`   | 22      | Work pattern analysis                    |
| `git-analyzer`       | 15      | Git operations                           |
| `commitlint`         | 6       | Conventional commit parsing              |
| `ui`                 | 2       | UI rendering                             |
| **Total**            | **724** |                                          |

---

## FAQ

**Q: Does DevDaily send my code anywhere?**
No. DevDaily reads your local git history and sends a text prompt to GitHub Copilot CLI. Your source code is not uploaded. Journal data stays on your machine.

**Q: Can I use DevDaily without GitHub Copilot?**
Currently, GitHub Copilot CLI is required for AI-powered generation. You can use `--raw-context` to get the structured context block without AI processing, and pipe it to any LLM of your choice.

**Q: Does it work with monorepos?**
Yes. DevDaily analyzes the git history of whatever repository you're currently in. Multi-project support via the journal lets you aggregate across repos.

**Q: How do I uninstall the git hooks?**
Run `devdaily init --remove-hooks`. This cleanly removes only the DevDaily lines from your hook files.

---

## Troubleshooting

### Common issues

| Problem                        | Solution                                             |
| ------------------------------ | ---------------------------------------------------- |
| `GitHub Copilot CLI not found` | Run `gh extension install github/gh-copilot`         |
| `Not a git repository`         | Navigate to a git repo before running commands       |
| `No commits found`             | Try increasing `--days` or check `--author` filter   |
| Clipboard not working          | Install `xclip` (Linux) or check permissions (macOS) |
| Webhook test fails             | Run `devdaily init --notifications` to reconfigure   |

### Diagnostics

```bash
devdaily doctor          # Check all prerequisites
devdaily doctor --fix    # Attempt automatic fixes
devdaily config --path   # Show config file location
```

---

## Roadmap

- [ ] Plugin system for custom output formats and integrations
- [ ] Background agent for periodic auto-snapshots
- [ ] Dashboard visualization of work patterns
- [ ] Notion integration for ticket tracking
- [ ] Team-level aggregated summaries
- [ ] Ollama/local LLM support as Copilot alternative

---

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

```bash
git clone https://github.com/hempun10/devdaily.git
cd devdaily
npm install
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development workflow, coding standards, and pull request process.

---

## License

[MIT](LICENSE) © [Hem Pun](https://github.com/hempun10)
