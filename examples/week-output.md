# Example: Weekly Summary Output

## Command

```bash
devdaily week
```

## Output

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   Weekly Summary                                         │
│                                                          │
╰──────────────────────────────────────────────────────────╯

## Highlights

Focused on backend auth improvements and API reliability this
week. Shipped JWT token refresh, fixed rate limiting, and
closed several long-standing bugs in the WebSocket layer.

## Key Accomplishments

### Features Shipped
- Implemented automatic JWT token refresh with configurable
  expiry thresholds (PROJ-234)
- Added CSV export for dashboard analytics reports (PROJ-289)
- Built dark mode toggle for the settings page (#42)

### Bug Fixes
- Fixed API rate limiting to return HTTP 429 instead of 500
- Resolved race condition in WebSocket reconnection handler
- Fixed login page crash on mobile Safari (PROJ-201)

### Technical Improvements
- Refactored user service to use repository pattern
- Added integration test suite for auth middleware
- Updated CI pipeline to run tests in parallel

## Stats

23 commits │ 4 PRs merged │ 1 PR open │ 3 tickets closed

────────────────────────────────────────────────────────────

✓ Copied to clipboard
```

## Last Week

```bash
devdaily week --last
```

Shows the summary for the previous week.

## Custom Date Range

```bash
devdaily week --from 2025-06-01 --to 2025-06-07
```

Shows the summary for a specific date range.

## Cross-Project Summary

```bash
devdaily week --all-projects
```

Aggregates data from all projects tracked in the local journal:

```
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   Weekly Summary (All Projects)                          │
│                                                          │
╰──────────────────────────────────────────────────────────╯

## backend-api (14 commits)
- Shipped auth refresh and rate limiting improvements
- Fixed WebSocket reconnection race condition

## frontend-app (9 commits)
- Added dark mode toggle and settings page redesign
- Fixed mobile Safari login crash

────────────────────────────────────────────────────────────

Total: 23 commits across 2 projects

✓ Copied to clipboard
```

## JSON Output

```bash
devdaily week --json
```

Outputs machine-readable stats (useful for dashboards or automation):

```json
{
  "period": {
    "start": "2025-07-07",
    "end": "2025-07-13"
  },
  "commits": 23,
  "pullRequests": {
    "merged": 4,
    "open": 1
  },
  "filesChanged": 34,
  "insertions": 1247,
  "deletions": 389,
  "topFiles": ["src/services/auth.ts", "src/middleware/rate-limit.ts", "src/handlers/websocket.ts"],
  "categories": [
    { "name": "backend", "percentage": 60 },
    { "name": "frontend", "percentage": 25 },
    { "name": "tests", "percentage": 15 }
  ]
}
```
