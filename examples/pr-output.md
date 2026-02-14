# Example: PR Description Output

## Command

```bash
devdaily pr
```

## Output

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   PR Description Generator                               │
│                                                          │
╰──────────────────────────────────────────────────────────╯

Analyzing branch...

ℹ Base branch: main (auto-detected)
ℹ PR template: .github/PULL_REQUEST_TEMPLATE.md
ℹ Diff context: included (87 lines)

Generated PR Description
────────────────────────────────────────────────────────────

# feat: add JWT token refresh and rate limiting improvements

## Description

- Added automatic JWT token refresh logic in `src/services/auth.ts`
  with configurable expiry thresholds and retry behavior
- Fixed API rate limiting middleware to return HTTP 429 instead of
  500 when limits are exceeded, matching the OpenAPI specification
- Updated WebSocket reconnection handler to prevent race conditions
  during concurrent reconnect attempts

## Type of Change

- [x] New feature
- [x] Bug fix

## Related Issues

Closes #34
Relates to PROJ-234

## Testing

- Added unit tests for token refresh flow (happy path + expiry edge cases)
- Updated integration tests for rate limiting middleware
- Manual testing against staging environment

────────────────────────────────────────────────────────────

commits: 5  │  files changed: 4  │  type: feat  │  tickets linked: 2  │  template: ✓

? What would you like to do?
  ❯ Copy to clipboard
    Create PR on GitHub
    Create draft PR
    Configure labels & reviewers
    Exit
```

## With Draft PR

```bash
devdaily pr --draft
```

Creates the PR directly as a draft:

```
✓ Created draft pull request #42
  https://github.com/org/repo/pull/42
```

## With Interactive Mode

```bash
devdaily pr --interactive
```

Prompts for labels, reviewers, and assignees before creating:

```
? Select labels: (Press <space> to select)
  ❯ ◯ feature
    ◯ bugfix
    ◯ documentation
    ◯ breaking-change

? Add reviewers (GitHub usernames, comma-separated): teammate1, teammate2
? Add assignees (GitHub usernames, comma-separated): myself

✓ Created pull request #42
  https://github.com/org/repo/pull/42
  Labels: feature, bugfix
  Reviewers: teammate1, teammate2
  Assignees: myself
```

## Configuration

Customize PR generation in `.devdaily.json`:

```json
{
  "pr": {
    "defaultBase": "main",
    "includeDiff": true,
    "maxDiffLines": 200,
    "titleFormat": "conventional",
    "includeTicketInTitle": true,
    "autoLabels": true,
    "defaultReviewers": ["teammate1"],
    "defaultAssignees": []
  }
}
```
