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

Analyzing branch...

ℹ Base branch: develop (auto-detected)
ℹ PR template: .github/PULL_REQUEST_TEMPLATE.md
ℹ PR guidelines: .devdaily-pr-prompt.md
ℹ Diff context: included (142 lines)

Generated PR Description
────────────────────────────────────────────────────────────

# feat: Add DevDaily AI CLI Tool

## Jira Ticket number and link

**Ticket No:** PROJ-123
**Ticket link:** https://jira.example.com/browse/PROJ-123

## Type of Change

- [ ] Bug fix
- [x] New feature
- [ ] Breaking change
- [ ] Documentation update

## Description

- Added `src/commands/pr.ts` with full PR generation pipeline
  including auto-detection of the default branch, diff context
  injection, and custom prompt file support
- Introduced `.devdaily-pr-prompt.md` loader that lets teams
  define tone, format, and section guidelines for AI-generated
  PR descriptions (similar to CLAUDE.md)
- Enhanced AI prompt with truncated unified diff so the model
  sees WHAT actually changed, not just filenames
- Added ticket linking that auto-generates `Closes #ID` (GitHub)
  or `Relates to [PROJ-123](url)` (Jira/Linear) references

## Impact

Developers can now generate accurate, reviewer-friendly PR
descriptions in seconds. The diff-aware prompt eliminates
hallucinated changes, and the custom prompt file ensures
descriptions match team conventions without manual editing.

## Additional Information

- The default branch is resolved automatically via
  `git symbolic-ref`, `gh repo view`, or probing for
  `main`/`master`/`develop` on the remote
- Diff context is truncated to 200 lines by default (configurable
  via `pr.maxDiffLines` in `.devdaily.json`)
- To skip diff context, use `--no-diff`
- To skip the custom prompt file, use `--no-prompt-file`

Relates to [PROJ-123](https://jira.example.com/browse/PROJ-123)

## Checklist

- [x] My code adheres to the coding and style guidelines of the project.
- [x] I have performed a self-review of my own code.
- [x] I have commented my code, particularly in hard-to-understand areas.
- [x] I have made corresponding changes to the documentation.
- [x] My changes generate no new warnings

────────────────────────────────────────────────────────────

commits: 12  │  files changed: 8  │  type: feat  │  tickets linked: 1  │  template: ✓

? What would you like to do?
  ❯ Copy to clipboard
    Create PR on GitHub
    Create draft PR
    Configure labels & reviewers
    Preview in browser
    Exit
```

## New Features Highlighted

### 1. Auto-detect Default Branch

No more passing `--base` every time. DevDaily resolves the default branch automatically:

```
Resolution order:
  1. --base flag (explicit override)
  2. git symbolic-ref refs/remotes/origin/HEAD
  3. gh repo view --json defaultBranchRef
  4. Probe for main / master / develop on remote
  5. Fall back to config pr.defaultBase
```

### 2. Diff-Aware AI Prompt

The AI now sees the actual code changes (truncated unified diff), not just filenames:

```
Before: AI sees "src/auth.ts" → guesses what changed
After:  AI sees "+export function validateToken(...)" → describes the real change
```

### 3. Custom PR Prompt File (`.devdaily-pr-prompt.md`)

Teams can define their description conventions in a file that gets injected into the AI prompt:

```bash
# Create during init
devdaily init

# Or manually create .devdaily-pr-prompt.md in your repo root
```

Search order:

1. Path from config (`pr.promptFile`)
2. `.devdaily-pr-prompt.md`
3. `.github/devdaily-pr-prompt.md`
4. `.github/PR_DESCRIPTION_PROMPT.md`
5. `docs/devdaily-pr-prompt.md`

### 4. Smart Ticket Linking

Ticket references are automatically formatted based on the PM tool:

```
GitHub Issues:  Closes #123
Jira:           Relates to [PROJ-123](https://jira.example.com/browse/PROJ-123)
Linear:         Relates to [ENG-456](https://linear.app/team/issue/ENG-456)
```

### 5. PR Template Integration

When a PR template exists, the AI receives the full template content (not just section names) so it follows repo-specific structure and guidelines.

## New CLI Options

```bash
devdaily pr                          # Full auto (detect branch, include diff, use template + prompt)
devdaily pr --base main              # Override base branch
devdaily pr --no-diff                # Skip diff context in AI prompt
devdaily pr --no-prompt-file         # Ignore .devdaily-pr-prompt.md
devdaily pr --no-template            # Ignore PR template, use default format
devdaily pr --debug                  # Show the full AI prompt and response
devdaily pr -i                       # Interactive mode (labels, reviewers, assignees)
devdaily pr -d                       # Create as draft PR
```

## Configuration (`.devdaily.json`)

```json
{
  "pr": {
    "defaultBase": "develop",
    "includeDiff": true,
    "maxDiffLines": 200,
    "promptFile": ".devdaily-pr-prompt.md",
    "autoLabels": true,
    "defaultReviewers": ["teammate1"],
    "titleFormat": "conventional",
    "includeTicketInTitle": true
  },
  "git": {
    "defaultBranch": "develop"
  }
}
```

## Created PR Example

When you select "Create PR on GitHub", it runs:

```bash
gh pr create --title "feat: Add DevDaily AI CLI Tool" \
  --body "..." \
  --base develop
```

Result:

```
✓ Created pull request #4
  https://github.com/hempun10/devdaily/pull/4
```
