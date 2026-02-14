# Contributing to DevDaily

Thank you for your interest in contributing to DevDaily! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior by opening an issue.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18.0.0
- [Git](https://git-scm.com)
- [GitHub CLI](https://cli.github.com) (`gh`) — for testing PR creation features
- [GitHub Copilot CLI](https://github.com/github/gh-copilot) — for testing AI generation features

### Setup

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/devdaily.git
cd devdaily
npm install

# Verify everything works
npm run typecheck
npm run lint
npm test
npm run build
```

### Running locally

```bash
# Watch mode — rebuilds on file changes
npm run dev

# Link the CLI globally for manual testing
npm link

# Now you can test commands in any git repo
devdaily standup --days 1 --no-copy
devdaily pr --debug
```

## Development Workflow

1. **Create a branch** from `main`:

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — write code, add tests, update docs.

3. **Run the quality checks:**

   ```bash
   npm run typecheck   # TypeScript compilation
   npm run lint        # ESLint
   npm run format      # Prettier formatting
   npm test            # Vitest test suite
   npm run build       # Production build
   ```

4. **Commit your changes** following the [commit convention](#commit-convention).

5. **Push and open a pull request** against `main`.

## Coding Standards

### TypeScript

- **Strict mode** is enabled — no `any` types unless absolutely necessary (use `unknown` and narrow).
- All new functions should have JSDoc comments describing their purpose.
- Prefer `async/await` over raw promises.
- Use `readonly` for properties and parameters that should not be mutated.

### Style

These are enforced by ESLint and Prettier (run automatically on commit via Husky):

- 2-space indentation
- Single quotes
- Semicolons required
- Trailing commas (`es5` style)
- 100-character line width
- LF line endings

```bash
# Auto-fix formatting
npm run lint:fix
npm run format
```

### File organization

- **One export per file** when possible — makes imports clear.
- **Co-locate tests** in the `tests/` directory, matching the source file name (e.g., `src/core/notifications.ts` → `tests/notifications.test.ts`).
- **Keep commands thin** — commands in `src/commands/` should orchestrate, not contain business logic. Business logic goes in `src/core/`.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). This is enforced by commitlint on every commit.

### Format

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `style`    | Formatting, missing semicolons, etc. (no logic)         |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or updating tests                                |
| `build`    | Changes to build system or dependencies                 |
| `ci`       | Changes to CI configuration                             |
| `chore`    | Other changes that don't modify src or tests            |
| `revert`   | Reverts a previous commit                               |

### Examples

```bash
feat: add JSON output format for standup command
fix(pr): handle repos with no default branch configured
docs: update installation instructions for Linux
test: add webhook notification integration tests
refactor(journal): extract snapshot serialization logic
```

### Rules

- Use lowercase for the description (no `Fix Bug` — use `fix bug`).
- Do not end the subject line with a period.
- Use the imperative mood ("add feature" not "added feature").

## Pull Request Process

1. **Fill out the PR template** — describe what changed and why.
2. **Keep PRs focused** — one feature or fix per PR. Large PRs are harder to review.
3. **Add tests** for new features and bug fixes.
4. **Update documentation** if your change affects user-facing behavior (README, help text, etc.).
5. **Make sure CI passes** — the PR must pass typecheck, lint, format check, tests, and build.
6. **Respond to review feedback** — we aim to review PRs within a few days.

### PR title format

Use the same [conventional commit format](#format) for PR titles:

```
feat: add Slack thread support for notifications
fix: clipboard copy failing on plain format
```

## Testing

We use [Vitest](https://vitest.dev/) for testing.

```bash
npm test                                    # Run all tests
npx vitest run tests/notifications.test.ts  # Run a specific file
npm run test:watch                          # Watch mode
npm run test:coverage                       # With coverage report
```

### Writing tests

- Place test files in `tests/` with a `.test.ts` suffix.
- Mock external dependencies (git, Copilot CLI, APIs) — tests should not require network access.
- Use `describe`/`it` blocks with clear, descriptive names.
- Test both the happy path and error/edge cases.

### Test structure example

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('formatOutput', () => {
  describe('plain format', () => {
    it('strips markdown headers', () => {
      // arrange
      const input = '## Completed\n\n- Task A';
      // act
      const result = formatOutput(input, 'plain');
      // assert
      expect(result.text).not.toContain('##');
      expect(result.text).toContain('Completed:');
    });
  });
});
```

## Project Structure

```
src/
├── commands/       # CLI command handlers (thin orchestration layer)
├── core/           # Business logic (git analysis, AI, journal, notifications)
├── config/         # Configuration loading, schema (Zod), secrets management
├── ui/             # Terminal UI rendering (colors, ASCII art, help screens)
├── utils/          # Shared utilities (clipboard, date helpers, formatting)
├── types/          # TypeScript type definitions
└── index.ts        # CLI entry point (Commander.js setup)

tests/              # Vitest test suites (mirrors src/ structure)
schemas/            # JSON Schema for .devdaily.json IDE autocomplete
examples/           # Example command outputs for documentation
```

## Reporting Issues

### Bug reports

When filing a bug report, please include:

1. **DevDaily version** (`devdaily --version`)
2. **Node.js version** (`node --version`)
3. **Operating system**
4. **Steps to reproduce** — what commands you ran
5. **Expected vs. actual behavior**
6. **Debug output** — run the failing command with `--debug` and include the output

### Feature requests

We welcome feature ideas! Please:

- Check existing issues to avoid duplicates.
- Describe the problem your feature would solve.
- Suggest a possible approach if you have one.
- Label with `enhancement`.

---

## Need Help?

- Browse [existing issues](https://github.com/hempun10/devdaily/issues)
- Read the [README](README.md) for usage documentation
- Run `devdaily doctor` to diagnose setup problems

Thank you for contributing!
