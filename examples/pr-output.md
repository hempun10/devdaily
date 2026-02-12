# Example: PR Description Output

## Command

```bash
devdaily pr
```

## Output

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   PR Description Generator                              │
│                                                          │
╰──────────────────────────────────────────────────────────╯

Analyzing changes...

Generated PR Description
────────────────────────────────────────────────────────────

# feat: Add DevDaily AI CLI Tool

## What Changed

This PR introduces DevDaily AI, a CLI tool that auto-generates:
- Daily standup notes from git commits
- PR descriptions with smart title generation
- Weekly work summaries
- Context recovery for forgotten work

## Key Features

- **Standup Generator**: Generate daily standup notes in 30 seconds
- **PR Automation**: Auto-generate PR titles and descriptions
- **Commitlint Integration**: Smart PR titles from conventional commits
- **Interactive Workflow**: Preview before creating PRs
- **Multi-format Support**: Markdown, Slack, and plain text output

## Technical Details

- TypeScript with strict mode enabled
- GitHub Copilot CLI integration for AI summaries
- Professional terminal UI (chalk, boxen, ora)
- Comprehensive test coverage (9 tests)
- CI/CD pipeline with GitHub Actions

## Files Changed

- Added src/commands/ (standup, pr, week, context)
- Added src/core/ (git-analyzer, copilot integration)
- Added src/utils/ (UI, helpers, commitlint parser)
- Added tests/ (9 test files, all passing)
- Added CI/CD workflows

Closes #1

────────────────────────────────────────────────────────────

? What would you like to do?
  ❯ Preview in terminal
    Copy to clipboard
    Create PR on GitHub
    Create draft PR
    Cancel
```

## Created PR Example

When you select "Create PR on GitHub", it runs:

```bash
gh pr create --title "feat: Add DevDaily AI CLI Tool" \
  --body "..." \
  --base main
```

Result:

```
✓ Created pull request #2
  https://github.com/hempun10/devdaily/pull/2
```
