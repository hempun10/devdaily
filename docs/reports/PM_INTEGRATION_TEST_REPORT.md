# PM Integration Test Report

> **Date:** 2026-02-14  
> **Tester:** himalpun  
> **DevDaily Version:** 0.4.0  
> **Branch:** `refactor/standup-generation`  
> **Node:** v23.11.0 | **OS:** macOS

---

## 1. Overview

End-to-end integration testing of DevDaily's standup generation against all three supported PM tools: **GitHub Issues**, **Linear**, and **Jira**. The goal was to verify that `devdaily standup` correctly extracts ticket IDs from commits/branches/PRs, fetches ticket metadata from each PM tool, and assembles accurate context for AI-powered standup generation.

### Test Matrix

| PM Tool       | Ticket Extraction | API Fetch | Description Parsing  | Standup Output | Status      |
| ------------- | ----------------- | --------- | -------------------- | -------------- | ----------- |
| GitHub Issues | ✅ Pass           | ✅ Pass   | ✅ Pass              | ✅ Pass        | **Working** |
| Linear        | ✅ Pass           | ✅ Pass   | ✅ Pass              | ✅ Pass        | **Working** |
| Jira (API v3) | ✅ Pass           | ✅ Pass   | ✅ Fixed (was crash) | ✅ Pass        | **Fixed**   |

---

## 2. Test Environment Setup

### 2.1 Test Repository

A dedicated test repository was created with realistic source code, issues, branches, commits, and PRs to simulate a real development workflow.

- **Repository:** [hempun10/devdaily-test-ground](https://github.com/hempun10/devdaily-test-ground)
- **Local path:** `/tmp/devdaily-test-ground`
- **Setup scripts:** `scripts/setup-test-repo.sh`, `scripts/setup-test-commits.sh`, `scripts/create-linear-issues.py`

### 2.2 Test Tickets Created

Five tickets were created on **both** GitHub Issues and Linear, mirroring the same work items:

| #   | Title                                            | Type    | GitHub Issue | Linear Issue |
| --- | ------------------------------------------------ | ------- | ------------ | ------------ |
| 1   | Fix login page crash on mobile Safari            | bug     | #1           | HEM-54       |
| 2   | Add dark mode toggle to settings page            | feature | #2           | HEM-55       |
| 3   | Refactor user service to use repository pattern  | task    | #3           | HEM-56       |
| 4   | API rate limiting returns wrong HTTP status code | bug     | #4           | HEM-57       |
| 5   | Add export to CSV for dashboard reports          | feature | #5           | HEM-58       |

### 2.3 Branches & PRs Created

| Branch                                            | PR  | Status | Linked Tickets |
| ------------------------------------------------- | --- | ------ | -------------- |
| `fix/HEM-54-login-page-crash-mobile-safari`       | #6  | Merged | #1, HEM-54     |
| `feature/HEM-55-dark-mode-settings`               | #7  | Merged | #2, HEM-55     |
| `refactor/HEM-56-user-service-repository-pattern` | #8  | Merged | #3, HEM-56     |
| `fix/HEM-57-rate-limit-wrong-status`              | #9  | Merged | #4, HEM-57     |
| `feature/HEM-58-dashboard-csv-export`             | #10 | Draft  | #5, HEM-58     |

Each branch had 1–2 commits with descriptive messages referencing both GitHub Issue numbers (`Closes #N`) and Linear identifiers (`Ref: HEM-NN`).

### 2.4 Configuration

**GitHub Issues mode** (`.devdaily.json`):

```json
{
  "projectManagement": {
    "tool": "github",
    "ticketPrefix": ""
  }
}
```

**Linear mode** (`.devdaily.linear.json`):

```json
{
  "projectManagement": {
    "tool": "linear",
    "ticketPrefix": "HEM"
  }
}
```

**Secrets** (`~/.config/devdaily/secrets.json`):

```json
{
  "linear": {
    "apiKey": "lin_api_***"
  }
}
```

---

## 3. Test Results

### 3.1 GitHub Issues Integration

**Command:** `devdaily standup --days 7 --raw-context`  
**Config:** `tool: "github"`

#### Ticket Extraction

- ✅ Extracted 5 GitHub Issue numbers from commit messages (`#1` – `#5`)
- ✅ Extracted 4 PR references (`#6` – `#10`) as additional ticket sources
- ✅ Total: 9 ticket IDs resolved

#### API Fetch

- ✅ All 9 tickets fetched successfully via `gh` CLI
- ✅ Issue descriptions returned as plain strings (no parsing issues)
- ✅ Issue types correctly inferred from labels (`bug`, `feature`, `task`)
- ✅ Issue status correctly mapped (`open`, `closed`)

#### Context Output (excerpt)

```
--- TICKETS/ISSUES (9) ---
#5: Add export to CSV for dashboard reports
  Type: feature | Status: open
  Description: Product wants users to be able to export the analytics dashboard data as CSV...
#4: API rate limiting returns wrong HTTP status code
  Type: bug | Status: closed
  Description: When rate limit is exceeded the API returns 500 instead of 429 Too Many Requests...
#1: Fix login page crash on mobile Safari
  Type: bug | Status: closed
  Description: The login form throws an unhandled exception on iOS Safari 17...
```

#### Standup Generation

- ✅ AI output references exact ticket numbers and PR numbers
- ✅ Descriptions are factual and grounded in commit data
- ✅ WIP ticket (#5 / PR #10 draft) correctly identified as "Today/Next"

---

### 3.2 Linear Integration

**Command:** `devdaily standup --days 7 --raw-context`  
**Config:** `tool: "linear"`, `ticketPrefix: "HEM"`

#### Ticket Extraction

- ✅ Extracted 5 Linear identifiers from branch names and commit messages (`HEM-54` – `HEM-58`)
- ✅ `ticketPrefix: "HEM"` correctly scoped extraction to HEM-prefixed IDs

#### API Fetch

- ✅ All 5/5 tickets fetched from Linear GraphQL API
- ✅ Descriptions returned as plain Markdown strings (no parsing issues)
- ✅ Status mapped correctly (e.g., `Todo`, `In Progress`)
- ✅ URLs correctly point to Linear workspace

#### Context Output (excerpt)

```
--- TICKETS/ISSUES (5) ---
HEM-58: Add export to CSV for dashboard reports
  Type: task | Status: Todo
  Description: Product wants users to be able to export the analytics dashboard data as CSV...
  URL: https://linear.app/hems-inc/issue/HEM-58/add-export-to-csv-for-dashboard-reports
HEM-54: Fix login page crash on mobile Safari
  Type: task | Status: In Progress
  Description: The login form throws an unhandled exception on iOS Safari 17...
  URL: https://linear.app/hems-inc/issue/HEM-54/fix-login-page-crash-on-mobile-safari
```

#### Standup Generation

- ✅ AI output references Linear ticket IDs (HEM-54, HEM-55, etc.)
- ✅ Each work item is bolded with ticket ID and accurate description
- ✅ Correctly distinguishes merged vs. in-progress work

---

### 3.3 Jira Integration (Bug Fix Verification)

**Tested on:** `aldcorporate/corporate-web-app` (real production repo with Jira)

#### Bug Found: `ticket.description.trim is not a function`

**Root Cause:** Jira REST API v3 (`/rest/api/3/search`) returns `fields.description` as an **Atlassian Document Format (ADF) object**, not a plain string:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Fix the bug..." }]
    }
  ]
}
```

The code was casting it with `(fields.description as string)`, which doesn't convert at runtime — the ADF object passed through and crashed when `.trim()` was called on it.

#### Fix Applied

1. **`src/core/project-management.ts`** — Added `extractAdfText()` helper that recursively walks ADF nodes and concatenates text content:

   ```typescript
   function extractAdfText(node: unknown): string {
     if (typeof node === 'string') return node;
     if (obj.type === 'text' && typeof obj.text === 'string') return obj.text;
     if (Array.isArray(obj.content)) {
       return obj.content.map(extractAdfText).join(isBlock ? '\n' : '');
     }
     return '';
   }
   ```

2. **`src/core/project-management.ts`** (`parseJiraIssue`) — Changed from unsafe cast to:

   ```typescript
   description: extractAdfText(fields.description),
   ```

3. **Defensive guards** added in three additional locations:
   - `standup-context.ts` → `formatForPrompt()`
   - `project-management.ts` → `formatTicketForContext()`
   - `copilot.ts` → `formatTicketContext()`

   Each now uses `typeof ticket.description === 'string' ? ticket.description : String(ticket.description)` before calling string methods.

#### Result

- ✅ `devdaily standup --days 3 --debug` on the corporate repo no longer crashes
- ✅ Jira ticket descriptions are now extracted as plain text from ADF objects
- ✅ All 21 tickets from the corporate repo fetched successfully

---

## 4. Additional Issues Discovered & Fixed

### 4.1 Linear Secrets Path Mismatch

**Issue:** The devdaily docs/init flow implied secrets lived at `~/.devdaily/secrets.json`, but the `ConfigManager` reads from `~/.config/devdaily/secrets.json`.

**Impact:** Linear API key was written to the wrong location, causing `isConfigured()` to return `false` and all ticket fetches to silently return `[]`.

**Fix:** Documented the correct path. The `fetchTickets()` method now logs this in `--debug` mode:

```
[fetchTickets] PM client (linear) is not configured
```

### 4.2 Silent Error Swallowing in `fetchTickets()`

**Issue:** The `fetchTickets()` method had a bare `catch {}` that returned an empty array on any error, making PM integration failures invisible.

**Fix:** Added debug-mode logging that surfaces the actual error when `--debug` flag is passed:

```typescript
} catch (err) {
  if (debug) {
    console.error(`[fetchTickets] Error fetching tickets:`, err);
  }
  return [];
}
```

---

## 5. Test Commands Reference

### Quick smoke test

```bash
cd /tmp/devdaily-test-ground

# GitHub Issues
echo '{"projectManagement":{"tool":"github","ticketPrefix":""}}' > .devdaily.json
devdaily standup --days 7 --raw-context   # Inspect context block
devdaily standup --days 7 --debug         # Full debug output
devdaily standup --days 7                 # Final standup

# Linear
echo '{"projectManagement":{"tool":"linear","ticketPrefix":"HEM"}}' > .devdaily.json
devdaily standup --days 7 --raw-context
devdaily standup --days 7 --debug
devdaily standup --days 7
```

### Reproducing the Jira ADF bug (pre-fix)

The bug occurred when a Jira instance using API v3 returned an ADF object for `fields.description`. To reproduce:

1. Connect to any Jira Cloud instance using `/rest/api/3/` (the default)
2. Ensure at least one ticket has a description with rich formatting
3. Run `devdaily standup --days N` where commits reference that ticket

Pre-fix: crashes with `ticket.description.trim is not a function`.  
Post-fix: description is extracted as plain text from the ADF tree.

---

## 6. Files Changed

| File                              | Change                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/core/project-management.ts`  | Added `extractAdfText()` helper; fixed `parseJiraIssue` description; defensive guards in `formatTicketForContext` |
| `src/core/standup-context.ts`     | Defensive description handling in `formatForPrompt`; debug logging in `fetchTickets`; added `debug` option        |
| `src/core/copilot.ts`             | Defensive description handling in `formatTicketContext`                                                           |
| `src/commands/standup.ts`         | Pass `debug` flag through to context builder                                                                      |
| `src/commands/week.ts`            | Pass `debug` flag through to context builder                                                                      |
| `scripts/setup-test-repo.sh`      | Test repo scaffold script (GitHub Issues)                                                                         |
| `scripts/setup-test-commits.sh`   | Branches, commits, PRs creation script                                                                            |
| `scripts/create-linear-issues.py` | Linear issue creation via GraphQL                                                                                 |

---

## 7. Test Suite Status

```
 ✓ tests/commitlint.test.ts          (6 tests)
 ✓ tests/context-analyzer.test.ts    (22 tests)
 ✓ tests/copilot.test.ts             (38 tests)
 ✓ tests/git-analyzer.test.ts        (1 test)
 ✓ tests/pr-template.test.ts         (25 tests)
 ✓ tests/project-management.test.ts  (130 tests)
 ✓ tests/standup-context.test.ts     (70 tests)
 ✓ tests/ui.test.ts                  (2 tests)

 Test Files  8 passed (8)
      Tests  294 passed (294)
```

- ✅ TypeScript typecheck: clean
- ✅ Build: success (227.40 KB)
- ✅ All 294 tests pass

---

## 8. Cleanup

To tear down the test environment:

```bash
# Delete the test GitHub repo (requires delete_repo scope)
gh auth refresh -h github.com -s delete_repo
gh repo delete hempun10/devdaily-test-ground --yes

# Remove local clone
rm -rf /tmp/devdaily-test-ground

# (Optional) Delete Linear test issues from the HEM project
# Do this manually from https://linear.app or via the API
```

---

## 9. Recommendations

### Immediate

- [x] Fix Jira ADF description crash — **done**
- [x] Add debug logging to `fetchTickets` — **done**
- [x] Test GitHub Issues integration end-to-end — **done**
- [x] Test Linear integration end-to-end — **done**

### Short-term

- [ ] Add unit tests for `extractAdfText()` with nested ADF structures (tables, lists, code blocks)
- [ ] Add integration test fixtures with mock PM API responses for all three tools
- [ ] Clarify secrets file path in `devdaily init` and `devdaily doctor` output
- [ ] Consider adding `devdaily connect --test` validation for ticket fetch (not just auth)

### Medium-term

- [ ] Support Jira API v2 fallback (returns description as plain text/wiki markup)
- [ ] Add Notion integration testing (currently stub)
- [ ] Automate PM integration tests in CI with mocked API responses
- [ ] Add `--pm-debug` flag to surface PM-specific errors without full `--debug` output
