# Testing Guide

This guide covers how to run and write tests for DevDaily.

## Running Tests

```bash
# Run the full test suite
npm test

# Run a specific test file
npx vitest run tests/notifications.test.ts

# Watch mode — re-runs tests on file changes
npm run test:watch

# Generate a coverage report
npm run test:coverage
```

## Test Structure

All tests live in the `tests/` directory and use [Vitest](https://vitest.dev/).

```
tests/
├── auto-snapshot.test.ts       # Side-effect snapshots, git hooks, config
├── commitlint.test.ts          # Conventional commit parsing
├── context-analyzer.test.ts    # Work pattern analysis, ticket extraction
├── copilot.test.ts             # AI prompt building, retries, error handling
├── git-analyzer.test.ts        # Git operations, branch detection
├── notifications.test.ts       # Slack/Discord webhooks, output formatter
├── pr-creation.test.ts         # PR generation pipeline
├── pr-prompt.test.ts           # Custom prompt file loading
├── pr-template.test.ts         # Template detection and parsing
├── project-management.test.ts  # Jira, Linear, GitHub Issues integration
├── standup-context.test.ts     # Context building, formatting
├── ui.test.ts                  # UI rendering
└── work-journal.test.ts        # Persistent storage, search, aggregation
```

## Writing Tests

### Conventions

- Place test files in `tests/` with a `.test.ts` suffix.
- Use `describe` / `it` blocks with clear, descriptive names.
- Mock external dependencies — tests must not require network access, git repos, or API keys.
- Test both the happy path and error/edge cases.

### Example

```typescript
import { describe, it, expect, vi } from 'vitest';
import { formatOutput } from '../src/utils/formatter.js';

describe('formatOutput', () => {
  describe('plain format', () => {
    it('strips markdown header markers', () => {
      const result = formatOutput('## Completed\n\n- Task A', 'plain');

      expect(result.text).not.toContain('##');
      expect(result.text).toContain('Completed:');
    });

    it('preserves the original markdown in .raw', () => {
      const md = '## Title\n\n**Bold text**';
      const result = formatOutput(md, 'plain');

      expect(result.raw).toBe(md);
    });
  });
});
```

### Mocking

Most tests mock the config module and external I/O. A typical mock setup:

```typescript
import { vi, beforeEach } from 'vitest';

const mockConfig = {
  output: { format: 'markdown', copyToClipboard: true, showStats: true, verbose: false },
  git: { defaultBranch: 'main', excludeAuthors: [], excludePatterns: [] },
  // ... other config fields as needed
};

vi.mock('../src/config/index.js', () => ({
  getConfig: () => mockConfig,
  getSecrets: () => ({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
```

For tests that use `fetch` (e.g., webhook tests), stub the global:

```typescript
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

## Quality Checklist

Before submitting a pull request, make sure all checks pass:

```bash
npm run typecheck       # TypeScript compilation (zero errors)
npm run lint            # ESLint (zero errors)
npm run format:check    # Prettier formatting
npm test                # Full test suite
npm run build           # Production build
```

These same checks run in CI on every pull request across Node.js 18, 20, and 22.

## Coverage

Generate an HTML coverage report:

```bash
npm run test:coverage
open coverage/index.html    # macOS
xdg-open coverage/index.html  # Linux
```

When adding new features, aim to maintain or improve test coverage. Every new module in `src/core/` should have a corresponding test file.

## Manual Smoke Testing

For changes that affect CLI behavior, it's helpful to test manually:

```bash
# Build and link
npm run build
npm link

# Navigate to any git repository
cd /path/to/a/git/repo

# Test the affected commands
devdaily standup --days 1 --no-copy
devdaily pr --debug --no-copy
devdaily week --no-copy
devdaily doctor
```

Use `--debug` to see the full prompt and context that would be sent to Copilot CLI. Use `--no-copy` to prevent clipboard writes during testing.

When done, unlink with:

```bash
npm unlink -g devdaily-ai
```
