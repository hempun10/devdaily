<div align="center">

# DevDaily AI

**Your AI-powered developer memory**

Auto-generate standup notes, PR descriptions, weekly summaries — and never lose context when switching tasks.

[![NPM Version](https://img.shields.io/npm/v/devdaily-ai)](https://www.npmjs.com/package/devdaily-ai)
[![Node Version](https://img.shields.io/node/v/devdaily-ai)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-654%20passing-brightgreen)](#testing)
[![License](https://img.shields.io/npm/l/devdaily-ai)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/hempun10/devdaily)](https://github.com/hempun10/devdaily)

[Installation](#installation) · [Quick Start](#quick-start) · [Commands](#commands) · [Configuration](#configuration) · [Contributing](docs/CONTRIBUTING.md)

</div>

---

## Why DevDaily?

Developers lose hours every week to low-value repetitive work:

- ⏱️ Writing standup notes every morning
- 📝 Crafting PR descriptions from scratch
- 📊 Compiling weekly accomplishments for managers
- 🧠 Trying to remember what you were doing before a context switch

**DevDaily fixes all of this.** It analyzes your git history, tracks your work automatically, and uses GitHub Copilot CLI to generate professional summaries — in seconds.

### What makes it different

Most dev tools generate text from commits. DevDaily goes further: it builds a **persistent local memory** of your work. Every standup you run, every PR you generate, every branch you switch — DevDaily silently records a snapshot. That means:

- `devdaily context` can tell you exactly where you left off, even days later
- `devdaily recall auth` finds every time you touched authentication code
- `devdaily week` produces accurate summaries even if you forgot to commit on some days
- Cross-project summaries work across all your repositories

No cloud. No telemetry. Everything stays in `~/.config/devdaily/journal/`.

---

## Features

| Feature                        | Description                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| **🚀 Standup Generator**       | Generate daily standup notes from commits, PRs, and tickets in 30 seconds            |
| **📄 Smart PR Descriptions**   | Auto-generate titles and descriptions with template support and commitlint           |
| **📅 Weekly Summaries**        | Cross-project weekly summaries with date ranges, journal enrichment, and JSON export |
| **📸 Work Snapshots**          | Capture rich snapshots of your repo state — branches, commits, PRs, tickets, diffs   |
| **🧠 Persistent Memory**       | Local work journal that remembers everything across sessions and days                |
| **🔄 Context Recovery**        | `devdaily context` — fight context-switching amnesia, resume where you left off      |
| **🔍 Work Search**             | `devdaily recall` — search your history by keyword, file, tag, or date range         |
| **⚡ Auto-Snapshots**          | Snapshots happen invisibly when you run commands or commit code — zero friction      |
| **🪝 Git Hooks**               | Opt-in `post-commit` and `post-checkout` hooks for automatic capture                 |
| **🎫 PM Integration**          | GitHub Issues, Jira, Linear, and Notion support for ticket context                   |
| **🖥️ Interactive Dashboard**   | Beautiful TUI with keyboard navigation and real-time stats                           |
| **🩺 Doctor Command**          | Diagnose and auto-fix setup issues                                                   |
| **🔔 Notifications**           | Send standups to Slack or Discord via webhooks                                       |
| **🔀 Interactive PR Workflow** | Preview, edit, select labels/reviewers/assignees, then create PRs                    |
| **📋 Auto-Copy**               | All outputs copied to clipboard automatically                                        |
| **🎨 Professional Output**     | Clean terminal UI with theming, ASCII art, and multi-format export                   |

---

## Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **Git** (any recent version)
- **GitHub CLI** with Copilot extension (for AI features)

### Quick Install

```bash
# Install DevDaily
npm install -g devdaily-ai

# Check prerequisites and auto-fix issues
devdaily doctor --fix

# Interactive setup — aliases, completions, PM integration, git hooks
devdaily init
```

After setup, use `dd` as a shortcut anywhere:

```bash
dd standup    # Generate standup
dd pr         # Generate PR description
dd week       # Weekly summary
dd context    # Resume where you left off
```

### GitHub Copilot CLI Setup

DevDaily uses GitHub Copilot CLI for AI-powered text generation. If you don't have it:

```bash
# Install GitHub CLI
brew install gh          # macOS
# winget install GitHub.cli   # Windows
# sudo apt install gh         # Debian/Ubuntu

# Authenticate
gh auth login

# Install Copilot extension
gh extension install github/gh-copilot
```

Run `devdaily doctor` at any time to verify your setup.

---

## Quick Start

```bash
# Navigate to any git repository
cd your-project

# Generate today's standup
devdaily standup

# Generate a PR description for your current branch
devdaily pr

# Get this week's summary
devdaily week

# Recover context after a break
devdaily context

# Search your work history
devdaily recall "authentication"

# Take a manual snapshot with a note
devdaily snapshot --note "Finished auth refactor"
```

---

## Commands

### Core Commands

| Command             | Aliases            | Description                                                  |
| ------------------- | ------------------ | ------------------------------------------------------------ |
| `devdaily standup`  | `s`, `su`, `daily` | Generate standup notes from recent commits, PRs, and tickets |
| `devdaily pr`       | `p`, `pull`        | Generate PR description from current branch                  |
| `devdaily week`     | `w`, `weekly`      | Generate weekly work summary                                 |
| `devdaily context`  | `ctx`, `resume`    | Recover what you were working on                             |
| `devdaily recall`   | `search`, `find`   | Search your work history                                     |
| `devdaily snapshot` | `snap`, `save`     | Manually capture a work snapshot                             |

### Setup & Utility

| Command            | Aliases          | Description                         |
| ------------------ | ---------------- | ----------------------------------- |
| `devdaily init`    | —                | Interactive setup wizard            |
| `devdaily config`  | `cfg`            | Manage configuration                |
| `devdaily doctor`  | `check`, `setup` | Diagnose and fix prerequisites      |
| `devdaily connect` | `pm`, `link`     | Test project management connections |
| `devdaily dash`    | `d`, `dashboard` | Interactive TUI dashboard           |

---

### `devdaily standup`

Generate daily standup notes from your recent commits, PRs, and tickets.

```bash
devdaily standup                  # Yesterday's work (default)
devdaily standup --days=3         # Last 3 days
devdaily standup --format=slack   # Slack-formatted output
devdaily standup --context        # Show detailed work analysis
devdaily standup --raw-context    # Output raw context (no AI)
devdaily standup --send           # Send to Slack/Discord
devdaily standup --no-journal     # Skip auto-snapshot side-effect
```

| Option                 | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `-d, --days <n>`       | Number of days to look back (default: 1)            |
| `-f, --format <type>`  | Output format: `markdown`, `slack`, `plain`, `json` |
| `-a, --author <email>` | Filter by author email                              |
| `-t, --ticket <id...>` | Include specific ticket IDs for context             |
| `--tone <type>`        | Output tone: `engineering`, `mixed`, `business`     |
| `--context`            | Show detailed work context analysis                 |
| `--raw-context`        | Output raw context block (no AI generation)         |
| `--preview`            | Show context and confirm before generating          |
| `--send`               | Send to all configured notification channels        |
| `--slack`              | Send to Slack                                       |
| `--discord`            | Send to Discord                                     |
| `--no-tickets`         | Skip fetching ticket context                        |
| `--no-prs`             | Skip fetching PR context                            |
| `--no-copy`            | Don't copy to clipboard                             |
| `--no-journal`         | Skip auto-saving a snapshot                         |
| `--debug`              | Show full prompt and context                        |

---

### `devdaily pr`

Generate comprehensive PR descriptions with smart title generation, template support, and interactive workflows.

```bash
devdaily pr                       # Generate and preview
devdaily pr --create              # Create PR on GitHub immediately
devdaily pr --draft               # Create as draft PR
devdaily pr --base=develop        # Compare against develop branch
devdaily pr --interactive         # Select labels, reviewers, assignees
devdaily pr --ticket PROJ-123     # Include specific ticket context
devdaily pr --no-journal          # Skip auto-snapshot
```

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-b, --base <branch>` | Base branch to compare against                    |
| `-c, --create`        | Create PR on GitHub                               |
| `-d, --draft`         | Create as draft PR                                |
| `-t, --ticket <id>`   | Include specific ticket/issue for context         |
| `-i, --interactive`   | Interactive mode for labels, reviewers, assignees |
| `-p, --preview`       | Show preview before creating                      |
| `--no-tickets`        | Skip fetching ticket context                      |
| `--no-template`       | Ignore PR template                                |
| `--no-diff`           | Skip diff context in AI prompt                    |
| `--no-prompt-file`    | Ignore `.devdaily-pr-prompt.md`                   |
| `--no-copy`           | Don't copy to clipboard                           |
| `--no-journal`        | Skip auto-saving a snapshot                       |
| `--debug`             | Show prompts and raw AI input                     |

**Smart features:**

- Auto-detects `.github/PULL_REQUEST_TEMPLATE.md` and fills sections
- Generates conventional commit titles (`feat:`, `fix:`, etc.)
- Extracts ticket/issue numbers from branch names and commits
- Supports custom prompt files (`.devdaily-pr-prompt.md`) for team conventions

---

### `devdaily week`

Generate weekly summaries with cross-project support and journal enrichment.

```bash
devdaily week                     # Current week
devdaily week --last              # Last week
devdaily week --from 2025-01-06 --to 2025-01-10  # Custom range
devdaily week --weeks-ago 2       # Two weeks ago
devdaily week --all-projects      # Cross-project summary from journal
devdaily week --json              # Output stats as JSON
devdaily week --save              # Save summary to journal
```

| Option                | Description                             |
| --------------------- | --------------------------------------- |
| `-l, --last`          | Show last week                          |
| `-s, --start <date>`  | Custom start date (YYYY-MM-DD)          |
| `--from <date>`       | Start date for custom range             |
| `--to <date>`         | End date for custom range               |
| `-w, --weeks-ago <n>` | Number of weeks back                    |
| `--all-projects`      | Cross-project summary from journal data |
| `-p, --project <id>`  | Filter by project identifier            |
| `--save`              | Save generated summary to journal       |
| `--json`              | Output stats as JSON (no AI)            |
| `--raw-context`       | Output raw context (no AI)              |
| `--no-tickets`        | Skip ticket fetching                    |
| `--no-prs`            | Skip PR fetching                        |
| `--no-journal`        | Skip journal data enrichment            |
| `--no-auto-snapshot`  | Skip auto-saving a snapshot             |
| `--no-copy`           | Don't copy to clipboard                 |
| `--debug`             | Show full prompt                        |

---

### `devdaily context`

Recover what you were working on — fight context-switching amnesia.

```bash
devdaily context                  # Last 7 days of context
devdaily context --days=14        # Last 14 days
devdaily context --date 2025-01-10  # Specific date
devdaily context --ai             # AI-powered "where did I leave off?" summary
devdaily context --all-projects   # Context across all tracked projects
devdaily context --branches       # Detailed active branch status
```

| Option               | Description                              |
| -------------------- | ---------------------------------------- |
| `-d, --days <n>`     | Number of days to look back (default: 7) |
| `-p, --project <id>` | Filter by project                        |
| `--all-projects`     | Show context across all tracked projects |
| `--date <date>`      | Show context for a specific date         |
| `--from <date>`      | Start date for range                     |
| `--to <date>`        | End date for range                       |
| `--ai`               | Generate an AI-powered summary           |
| `--branches`         | Show detailed active branch status       |
| `--raw`              | Output raw context data                  |
| `--no-copy`          | Don't copy to clipboard                  |
| `--debug`            | Show debug output                        |

---

### `devdaily recall`

Search your work history — "when did I last work on X?"

```bash
devdaily recall "authentication"  # Search by keyword
devdaily recall --file src/auth.ts  # Find when a file was changed
devdaily recall --tag feature     # Filter by tag
devdaily recall "login" --ai      # AI summary of search results
devdaily recall --from 2025-01-01 --to 2025-01-31  # Date range
devdaily recall "PROJ-123"        # Search by ticket ID
```

| Option                | Description                      |
| --------------------- | -------------------------------- |
| `-p, --project <id>`  | Filter by project                |
| `--from <date>`       | Start date (YYYY-MM-DD)          |
| `--to <date>`         | End date (YYYY-MM-DD)            |
| `-d, --days <n>`      | Search last N days (default: 90) |
| `-t, --tag <tags...>` | Filter by tags                   |
| `-f, --file <path>`   | Search for a specific file path  |
| `-l, --limit <n>`     | Max results (default: 10)        |
| `--ai`                | AI-powered summary of results    |
| `--json`              | Output as JSON                   |
| `--no-copy`           | Don't copy to clipboard          |
| `--debug`             | Show debug output                |

---

### `devdaily snapshot`

Manually capture a snapshot of your current work state.

> **Note:** You rarely need to run this manually. Snapshots are taken automatically when you run `standup`, `pr`, or `week`, and optionally on every commit/checkout via git hooks. Use this command when you want to attach a note, tag, or force a snapshot at a specific moment.

```bash
devdaily snapshot                 # Take a full snapshot
devdaily snapshot --light         # Quick snapshot (no PRs/tickets)
devdaily snapshot --note "Finished auth refactor"
devdaily snapshot --tag milestone release
devdaily snapshot --list          # List recent snapshots (7 days)
devdaily snapshot --list 30       # List last 30 days
devdaily snapshot --stats         # Show journal storage stats
devdaily snapshot --prune 90      # Remove entries older than 90 days
```

| Option                | Description                               |
| --------------------- | ----------------------------------------- |
| `-d, --date <date>`   | Snapshot date (YYYY-MM-DD)                |
| `-p, --project <id>`  | Override project identifier               |
| `-n, --note <text>`   | Attach a note                             |
| `-t, --tag <tags...>` | Add custom tags                           |
| `--light`             | Quick mode — commits and branch info only |
| `--list [days]`       | List recent snapshots                     |
| `--stats`             | Show journal storage stats                |
| `--prune <days>`      | Remove entries older than N days          |
| `--no-prs`            | Skip PR data                              |
| `--no-tickets`        | Skip ticket data                          |
| `--no-branches`       | Skip branch listing                       |
| `--debug`             | Show debug output                         |

---

### `devdaily init`

Interactive setup wizard for aliases, completions, config, PM integration, and git hooks.

```bash
devdaily init                     # Interactive setup
devdaily init --global            # Global setup
devdaily init --git-hooks         # Install auto-snapshot git hooks
devdaily init --remove-hooks      # Remove devdaily git hooks
devdaily init --alias             # Only set up shell alias
devdaily init --completions       # Only set up tab completions
devdaily init --pm                # Only set up PM integration
devdaily init --notifications     # Only set up Slack/Discord
```

**Git hooks** (opt-in):

- `post-commit` — Automatically snapshots after each commit
- `post-checkout` — Automatically snapshots when switching branches
- Runs in background, never slows down git
- POSIX-compatible, safe with existing hooks (appends, doesn't overwrite)
- Remove cleanly with `devdaily init --remove-hooks`

---

### `devdaily doctor`

Check system requirements and diagnose issues.

```bash
devdaily doctor                   # Check all prerequisites
devdaily doctor --fix             # Attempt automatic fixes
```

**Checks:** Node.js version, Git, GitHub CLI, authentication, Copilot extension.

---

### `devdaily config`

Manage configuration.

```bash
devdaily config                   # Interactive editor
devdaily config --show            # Show current config
devdaily config --edit            # Open in $EDITOR
devdaily config --path            # Show config file path
devdaily config --reset           # Reset to defaults
```

---

### `devdaily connect`

Test project management connections.

```bash
devdaily connect                  # Test current PM integration
devdaily connect --test           # Run connection test
```

---

## How Auto-Snapshots Work

DevDaily captures your work state **automatically** at natural moments — you never have to think about it.

### When snapshots happen

| Trigger             | How               | What's captured                               |
| ------------------- | ----------------- | --------------------------------------------- |
| `devdaily standup`  | Side-effect       | Light snapshot (commits, branch)              |
| `devdaily pr`       | Side-effect       | Light snapshot + PR context                   |
| `devdaily week`     | Side-effect       | Light snapshot                                |
| `git commit`        | Git hook (opt-in) | Light snapshot                                |
| `git checkout`      | Git hook (opt-in) | Light snapshot + branch note                  |
| `devdaily snapshot` | Manual            | Full snapshot (PRs, tickets, branches, diffs) |

### Disabling auto-snapshots

```bash
# Per-command: skip with a flag
devdaily standup --no-journal
devdaily pr --no-journal

# Globally: disable in config
# .devdaily.json
{
  "journal": {
    "autoSnapshot": false
  }
}
```

### What's stored

Snapshots are saved locally to `~/.config/devdaily/journal/` as JSON files organized by date. Each snapshot records:

- Current branch and active local branches
- Today's commits with files changed
- Recent commits for context
- Open and recently merged PRs
- Extracted ticket/issue references
- Work category breakdown (frontend, backend, infra, etc.)
- Diff stats and top changed files
- Optional notes and tags

No data is uploaded anywhere. The journal is yours.

---

## Configuration

DevDaily supports global and per-project configuration.

### Config file locations

| Scope       | Path                                                  |
| ----------- | ----------------------------------------------------- |
| **Global**  | `~/.config/devdaily/config.json`                      |
| **Local**   | `.devdaily.json` in project root                      |
| **Secrets** | `.devdaily.secrets.json` (auto-added to `.gitignore`) |

Local config overrides global config.

### Example configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/hempun10/devdaily/main/schemas/devdaily.schema.json",
  "version": 1,

  "theme": {
    "primary": "cyan",
    "accent": "magenta"
  },

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
    "groupBy": "ticket",
    "includeTicketLinks": true,
    "sections": ["completed", "in-progress", "blockers"]
  },

  "pr": {
    "defaultBase": "main",
    "includeDiff": true,
    "maxDiffLines": 200,
    "titleFormat": "conventional",
    "includeTicketInTitle": true,
    "autoLabels": true
  },

  "week": {
    "startDay": "monday",
    "includeWeekends": false
  },

  "journal": {
    "autoSnapshot": true,
    "gitHooks": false,
    "hooks": {
      "postCommit": true,
      "postCheckout": true
    },
    "quiet": true
  },

  "projectManagement": {
    "tool": "github",
    "ticketPrefix": "PROJ"
  },

  "notifications": {
    "slack": {
      "enabled": false
    },
    "discord": {
      "enabled": false
    }
  }
}
```

### Project management integration

DevDaily supports multiple PM tools for richer context in AI summaries:

| Tool              | Config             | Auth                                            |
| ----------------- | ------------------ | ----------------------------------------------- |
| **GitHub Issues** | `"tool": "github"` | GitHub CLI (`gh auth login`)                    |
| **Jira**          | `"tool": "jira"`   | `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_BASE_URL` |
| **Linear**        | `"tool": "linear"` | `LINEAR_API_KEY`                                |
| **Notion**        | `"tool": "notion"` | `NOTION_API_KEY`, `NOTION_DATABASE_ID`          |

Set up interactively with `devdaily init --pm` or `devdaily connect`.

**Ticket extraction** — DevDaily automatically finds ticket IDs from:

1. Branch names: `feature/PROJ-123-description`
2. Commit messages: `fix: resolve issue PROJ-123`
3. PR titles and bodies
4. Manual input: `--ticket PROJ-123`

### Custom PR prompt file

Create `.devdaily-pr-prompt.md` in your repo root to customize how AI generates PR descriptions (like `CLAUDE.md` but for PRs). DevDaily searches for this file automatically. Generate a starter with `devdaily init`.

---

## Privacy & Security

- **All data stays local.** The work journal is stored in `~/.config/devdaily/journal/` on your machine.
- **No telemetry.** DevDaily does not phone home.
- **AI context is minimal.** Only commit messages, branch names, and diff summaries are sent to GitHub Copilot CLI. Full file contents are never shared.
- **Secrets are separate.** API tokens are stored in `.devdaily.secrets.json`, which is auto-added to `.gitignore`.
- **Opt-in features.** Git hooks, notifications, and PM integrations are all opt-in.

---

## Development

### Prerequisites

```bash
git clone https://github.com/hempun10/devdaily.git
cd devdaily
npm install
```

### Common tasks

```bash
npm run dev          # Run in development mode (tsx watch)
npm run build        # Production build (tsup)
npm test             # Run all tests (vitest)
npm run test:watch   # Tests in watch mode
npm run test:coverage # Tests with coverage
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier formatting
npm run format:check # Check formatting
```

### Project structure

```
devdaily/
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── commands/                 # CLI command implementations
│   │   ├── standup.ts            #   Standup generator
│   │   ├── pr.ts                 #   PR description generator
│   │   ├── week.ts               #   Weekly summary
│   │   ├── context.ts            #   Context recovery ("where did I leave off?")
│   │   ├── recall.ts             #   Work history search
│   │   ├── snapshot.ts           #   Manual snapshot capture
│   │   ├── dash.ts               #   Interactive TUI dashboard
│   │   ├── init.ts               #   Setup wizard
│   │   ├── config.ts             #   Configuration management
│   │   ├── doctor.ts             #   Prerequisite checker
│   │   └── connect.ts            #   PM connection tester
│   ├── core/                     # Core business logic
│   │   ├── git-analyzer.ts       #   Git operations (commits, branches, diffs)
│   │   ├── copilot.ts            #   GitHub Copilot CLI integration
│   │   ├── context-analyzer.ts   #   Work context extraction & categorization
│   │   ├── standup-context.ts    #   Rich standup context builder
│   │   ├── snapshot-builder.ts   #   Repo state capture → WorkSnapshot
│   │   ├── work-journal.ts       #   Persistent local storage layer
│   │   ├── auto-snapshot.ts      #   Side-effect snapshots & git hook utilities
│   │   ├── project-management.ts #   PM tool abstraction (Jira, Linear, Notion, GitHub)
│   │   ├── pm-errors.ts          #   PM error handling & diagnostics
│   │   ├── github.ts             #   GitHub API client
│   │   ├── github-repo.ts        #   GitHub repo metadata & PR creation
│   │   ├── pr-template.ts        #   PR template detection & parsing
│   │   ├── pr-prompt.ts          #   Custom PR prompt file support
│   │   └── notifications.ts      #   Slack/Discord webhook integration
│   ├── config/                   # Configuration system
│   │   ├── schema.ts             #   Zod schema (type-safe config)
│   │   └── index.ts              #   Config manager (global + local + secrets)
│   ├── ui/                       # Terminal UI system
│   │   ├── renderer.ts           #   Main UI rendering (boxes, sections, stats)
│   │   ├── colors.ts             #   Theme-aware color system
│   │   ├── ascii.ts              #   ASCII art and symbols
│   │   ├── help.ts               #   Help screen rendering
│   │   ├── dashboard.ts          #   Interactive TUI dashboard
│   │   ├── keyboard.ts           #   Keyboard input handling
│   │   └── index.ts              #   UI re-exports
│   ├── utils/                    # Shared utilities
│   │   ├── helpers.ts            #   Date, clipboard, formatting helpers
│   │   ├── commitlint.ts         #   Conventional commit parsing
│   │   └── ui.ts                 #   UI utility helpers
│   └── types/                    # TypeScript type definitions
│       └── index.ts
├── tests/                        # Test suite (654 tests)
│   ├── auto-snapshot.test.ts     #   Auto-snapshot, hooks, side-effects (74 tests)
│   ├── work-journal.test.ts      #   Work journal & snapshot builder (123 tests)
│   ├── project-management.test.ts #  PM integrations (130 tests)
│   ├── pr-creation.test.ts       #   PR creation & workflows (123 tests)
│   ├── standup-context.test.ts   #   Standup context building (70 tests)
│   ├── copilot.test.ts           #   Copilot CLI integration (38 tests)
│   ├── pr-prompt.test.ts         #   PR prompt file handling (26 tests)
│   ├── pr-template.test.ts       #   PR template parsing (25 tests)
│   ├── context-analyzer.test.ts  #   Context analysis (22 tests)
│   ├── git-analyzer.test.ts      #   Git operations (15 tests)
│   ├── commitlint.test.ts        #   Commit parsing (6 tests)
│   └── ui.test.ts                #   UI rendering (2 tests)
├── docs/                         # Documentation
│   ├── CONTRIBUTING.md
│   ├── TESTING.md
│   ├── PUBLISHING.md
│   ├── PROJECT_SETUP.md
│   ├── DEV_TOOLING_SETUP.md
│   ├── QUICK_REFERENCE.md
│   └── reports/
├── schemas/                      # JSON schemas
│   └── devdaily.schema.json      #   Config schema for IDE autocomplete
├── examples/                     # Example outputs
│   ├── standup-output.md
│   ├── pr-output.md
│   └── week-output.md
├── scripts/                      # Dev/test scripts
│   ├── setup-test-repo.sh
│   ├── setup-test-commits.sh
│   └── create-linear-issues.py
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                #   CI — lint, typecheck, test (Node 18/20/22)
│   │   └── publish.yml           #   NPM publish on GitHub release
│   └── PULL_REQUEST_TEMPLATE.md
├── package.json
├── tsconfig.json
├── tsup.config.ts                # Build config
├── vitest.config.ts              # Test config
├── eslint.config.js              # Lint config
├── commitlint.config.cjs         # Commit message linting
├── CHANGELOG.md
└── LICENSE
```

### Tech stack

| Layer                   | Technology                    |
| ----------------------- | ----------------------------- |
| **Language**            | TypeScript (strict mode)      |
| **CLI framework**       | Commander.js                  |
| **Git operations**      | simple-git                    |
| **AI integration**      | GitHub Copilot CLI via execa  |
| **Interactive prompts** | Inquirer.js                   |
| **Terminal UI**         | chalk, picocolors, boxen, ora |
| **Clipboard**           | clipboardy                    |
| **Config validation**   | Zod                           |
| **Testing**             | Vitest                        |
| **Build**               | tsup (ESM output)             |
| **Linting**             | ESLint + Prettier             |
| **Commit linting**      | commitlint + Husky            |

---

## Testing

DevDaily has a comprehensive test suite with **654 tests across 12 test files**.

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/auto-snapshot.test.ts

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Test coverage by module

| Module               | Tests | Coverage Area                                          |
| -------------------- | ----- | ------------------------------------------------------ |
| `project-management` | 130   | Jira, Linear, Notion, GitHub Issues integration        |
| `pr-creation`        | 123   | PR generation, templates, interactive workflows        |
| `work-journal`       | 123   | Persistent storage, search, cross-project, merge logic |
| `auto-snapshot`      | 74    | Side-effect snapshots, git hooks, install/remove       |
| `standup-context`    | 70    | Context building, formatting, enrichment               |
| `copilot`            | 38    | Copilot CLI integration, retries, error handling       |
| `pr-prompt`          | 26    | Custom prompt file loading and merging                 |
| `pr-template`        | 25    | Template detection and section parsing                 |
| `context-analyzer`   | 22    | Ticket extraction, work categorization                 |
| `git-analyzer`       | 15    | Git operations, branch detection                       |
| `commitlint`         | 6     | Conventional commit parsing                            |
| `ui`                 | 2     | UI rendering                                           |

---

## FAQ

**Q: Does this work offline?**
A: Git analysis, snapshots, journal, and context recovery work offline. AI text generation requires GitHub Copilot CLI (internet connection). Use `--raw-context` to get structured data without AI.

**Q: What git hosting providers are supported?**
A: DevDaily works with any git repository. PR creation requires GitHub CLI. Ticket integration supports GitHub, Jira, Linear, and Notion.

**Q: Is my code sent to external services?**
A: Only commit messages and diff summaries are sent to GitHub Copilot CLI. Full file contents are never shared. The work journal stays entirely local.

**Q: Can I use this with monorepos?**
A: Yes. DevDaily analyzes the git history of your current directory. Use `--project` to track multiple sub-projects, and `--all-projects` for cross-project summaries.

**Q: What about conventional commits?**
A: DevDaily parses conventional commits automatically. PR titles are generated with proper `feat:`, `fix:`, `chore:` prefixes. Work is categorized by type.

**Q: How do I clean up old journal data?**
A: Run `devdaily snapshot --prune 90` to remove entries older than 90 days. Use `devdaily snapshot --stats` to see storage usage.

**Q: Can I disable the auto-snapshot behavior?**
A: Yes. Set `"journal": { "autoSnapshot": false }` in your config, or pass `--no-journal` to individual commands.

---

## Troubleshooting

### Common issues

| Problem                        | Solution                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| `command not found: devdaily`  | `npm install -g devdaily-ai`                                             |
| `GitHub Copilot CLI not found` | `gh extension install github/gh-copilot`                                 |
| `Not a git repository`         | Run inside a git repo, or use `--all-projects` for journal-only commands |
| `No commits found`             | Make sure you have commits: `git log --oneline`                          |
| PM tickets not appearing       | Run `devdaily connect --test` to diagnose                                |

### Diagnostics

```bash
# Full system check
devdaily doctor

# Auto-fix what's possible
devdaily doctor --fix

# Debug any command
devdaily standup --debug
devdaily pr --debug
```

---

## Roadmap

- [x] Standup, PR, and weekly summary generation
- [x] GitHub Issues, Jira, Linear, Notion integration
- [x] PR template detection and auto-fill
- [x] Interactive PR workflow (labels, reviewers, assignees)
- [x] Persistent work journal and snapshots
- [x] Context recovery (`devdaily context`)
- [x] Work history search (`devdaily recall`)
- [x] Automatic side-effect snapshots
- [x] Git hooks for post-commit and post-checkout
- [x] Cross-project weekly summaries
- [x] Custom PR prompt files (`.devdaily-pr-prompt.md`)
- [ ] Support for Ollama / local AI models
- [ ] VS Code extension
- [ ] Team collaboration features
- [ ] Analytics and impact tracking dashboard
- [ ] Scheduled auto-standup (cron / launchd)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/hempun10/devdaily.git
cd devdaily
npm install
npm test            # Make sure everything passes
npm run dev         # Start developing
```

---

## License

MIT © [Hem Pun](https://github.com/hempun10)

---

<div align="center">

**[⬆ Back to top](#devdaily-ai)**

Made with ❤️ by developers, for developers

</div>
