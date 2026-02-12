# Example: Standup Output

## Command

```bash
devdaily standup --days=1
```

## Output

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   Daily Standup - February 12, 2026                     │
│                                                          │
╰──────────────────────────────────────────────────────────╯

Analyzing commits from the last 1 day(s)...

Yesterday's Work
────────────────────────────────────────────────────────────

• Added standup generator with multiple format support
• Implemented PR description auto-generation
• Set up TypeScript project structure
• Added comprehensive test suite with 9 passing tests
• Configured CI/CD pipeline with GitHub Actions

Commits Analyzed: 5
Time Range: Feb 11, 2026 - Feb 12, 2026

────────────────────────────────────────────────────────────

✓ Copied to clipboard
```

## With Slack Format

```bash
devdaily standup --format=slack
```

Output:

```
*Yesterday's Work* 🚀

• Added standup generator with multiple format support
• Implemented PR description auto-generation
• Set up TypeScript project structure
• Added comprehensive test suite with 9 passing tests
• Configured CI/CD pipeline with GitHub Actions

_5 commits from Feb 11 - Feb 12, 2026_
```
