# Example: Weekly Summary Output

## Command

```bash
devdaily week
```

## Output

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   Weekly Summary                                        │
│                                                          │
╰──────────────────────────────────────────────────────────╯

Analyzing commits from Feb 5 - Feb 12, 2026...

Week of February 5-12, 2026
────────────────────────────────────────────────────────────

## Highlights

Built and launched DevDaily AI - a CLI tool that saves developers
time by auto-generating standup notes, PR descriptions, and weekly
summaries from git history.

## Key Accomplishments

### Features Shipped
- Standup generator with multi-format support
- PR description auto-generation with commitlint
- Interactive PR workflow (preview/draft)
- Weekly summary command
- Context recovery stub

### Technical Work
- Set up TypeScript project with strict mode
- Implemented GitHub Copilot CLI integration
- Built professional terminal UI (no emojis)
- Added comprehensive test suite (9 tests, 100% passing)
- Configured CI/CD with GitHub Actions
- Set up Husky pre-commit hooks
- Published to NPM as devdaily-ai v0.1.0

### Code Quality
- ESLint + Prettier configured
- Commitlint for conventional commits
- Type-safe with TypeScript strict mode
- 18.97 KB bundle size (15.2 KB gzipped)

## Impact

23 commits | 15 files changed | +2,847 -0 lines

────────────────────────────────────────────────────────────

✓ Copied to clipboard
```

## Last Week

```bash
devdaily week --last
```

Shows summary for the previous week (Feb 29 - Feb 5, 2026)
