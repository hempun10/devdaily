# Example: Standup Output

## Command

```bash
devdaily standup --days 1
```

## Output

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   Your Standup                                           │
│                                                          │
╰──────────────────────────────────────────────────────────╯

## Completed

- Implemented JWT token refresh logic in the auth service
- Fixed race condition in WebSocket reconnection handler
- Updated API rate limiting middleware to return proper 429 status codes

## In Progress

- Migrating user preferences to the new settings schema (PROJ-234)
- Reviewing PR #42 for the dashboard CSV export feature

## Blockers

- Waiting on DevOps team for staging environment Redis upgrade

────────────────────────────────────────────────────────────

commits: 5  │  days: 1  │  PRs: 2  │  primary area: backend

✓ Copied to clipboard
```

## With Plain Format

```bash
devdaily standup --format plain
```

```
Completed:

• Implemented JWT token refresh logic in the auth service
• Fixed race condition in WebSocket reconnection handler
• Updated API rate limiting middleware to return proper 429 status codes

In Progress:

• Migrating user preferences to the new settings schema (PROJ-234)
• Reviewing PR #42 for the dashboard CSV export feature

Blockers:

• Waiting on DevOps team for staging environment Redis upgrade
```

## With Slack Format

```bash
devdaily standup --format slack
```

```
*Completed*

• Implemented JWT token refresh logic in the auth service
• Fixed race condition in WebSocket reconnection handler
• Updated API rate limiting middleware to return proper 429 status codes

*In Progress*

• Migrating user preferences to the new settings schema (PROJ-234)
• Reviewing PR #42 for the dashboard CSV export feature

*Blockers*

• Waiting on DevOps team for staging environment Redis upgrade
```

## With JSON Format

```bash
devdaily standup --format json
```

```json
{
  "generatedAt": "2025-07-14T09:30:00.000Z",
  "meta": {
    "title": "Daily Standup",
    "commits": 5,
    "prs": 2,
    "tickets": 1,
    "days": 1,
    "branch": "feat/auth-refresh",
    "repo": "org/backend-api"
  },
  "sections": [
    {
      "heading": "Completed",
      "level": 2,
      "items": [
        "Implemented JWT token refresh logic in the auth service",
        "Fixed race condition in WebSocket reconnection handler",
        "Updated API rate limiting middleware to return proper 429 status codes"
      ]
    },
    {
      "heading": "In Progress",
      "level": 2,
      "items": [
        "Migrating user preferences to the new settings schema (PROJ-234)",
        "Reviewing PR #42 for the dashboard CSV export feature"
      ]
    },
    {
      "heading": "Blockers",
      "level": 2,
      "items": ["Waiting on DevOps team for staging environment Redis upgrade"]
    }
  ]
}
```
