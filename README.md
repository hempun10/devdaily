# DevDaily AI

> Your AI memory for developer work

Never forget what you did. Auto-generate PR descriptions, standup notes, and work summaries from your git history.

## Features

- **Standup Generator** - Yesterday's work in 30 seconds
- **PR Descriptions** - AI-generated from your commits
- **Weekly Summaries** - Track your impact over time
- **Smart Context** - Remember what you were working on

## Installation

```bash
npm install -g devdaily-ai
```

## Quick Start

```bash
# Generate standup notes
devdaily standup

# Create PR description
devdaily pr

# Weekly summary
devdaily week
```

## Commands

### `devdaily standup`

Generate standup notes from your recent commits.

```bash
devdaily standup              # Yesterday's work
devdaily standup --days=3     # Last 3 days
devdaily standup --format=slack
```

### `devdaily pr`

Generate comprehensive PR descriptions.

```bash
devdaily pr                   # Generate description
devdaily pr --create          # Create PR on GitHub
devdaily pr --draft           # Create as draft
devdaily pr --base=develop    # Compare to develop
```

### `devdaily week`

Get a weekly summary of your work.

```bash
devdaily week                 # Current week
devdaily week --last          # Last week
```

## Requirements

- Node.js >= 18
- Git repository
- GitHub CLI (`gh`) with Copilot extension

## Setup

1. Install GitHub CLI:
```bash
brew install gh  # macOS
# or visit https://cli.github.com
```

2. Install Copilot extension:
```bash
gh extension install github/gh-copilot
gh auth login
```

3. Install DevDaily:
```bash
npm install -g devdaily-ai
```

## Development

```bash
# Clone repo
git clone https://github.com/yourusername/devdaily-ai
cd devdaily-ai

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## License

MIT
