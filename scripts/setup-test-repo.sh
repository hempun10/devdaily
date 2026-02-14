#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# DevDaily Test Repo Setup Script
#
# Creates a dummy GitHub repo with GitHub Issues and Linear issues,
# then makes commits/branches/PRs referencing those tickets so you can
# test `devdaily standup` end-to-end against both PM integrations.
#
# Prerequisites:
#   - gh CLI installed and authenticated (`gh auth status`)
#   - (Optional) LINEAR_API_KEY env var or ~/.devdaily/secrets.json with linear.apiKey
#   - git configured with user.name and user.email
#
# Usage:
#   chmod +x scripts/setup-test-repo.sh
#   ./scripts/setup-test-repo.sh                    # GitHub Issues only
#   LINEAR_TEAM_KEY=ENG ./scripts/setup-test-repo.sh # GitHub Issues + Linear
# ─────────────────────────────────────────────────────────────────────────────

REPO_NAME="${REPO_NAME:-devdaily-test-ground}"
REPO_OWNER=$(gh api user --jq '.login')
REPO_FULL="${REPO_OWNER}/${REPO_NAME}"
WORK_DIR="${WORK_DIR:-/tmp/${REPO_NAME}}"
LINEAR_TEAM_KEY="${LINEAR_TEAM_KEY:-}"  # e.g., "ENG", "DEV" — leave empty to skip Linear
LINEAR_API_KEY="${LINEAR_API_KEY:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*"; }
header()  { echo -e "\n${BOLD}━━━ $* ━━━${NC}\n"; }

# ─── Preflight checks ────────────────────────────────────────────────────────

header "Preflight Checks"

if ! command -v gh &>/dev/null; then
  error "gh CLI is not installed. Install it: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  error "gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

success "GitHub CLI authenticated as ${BOLD}${REPO_OWNER}${NC}"

# Try to read Linear API key from devdaily secrets if not in env
if [[ -z "$LINEAR_API_KEY" ]]; then
  SECRETS_FILE="$HOME/.devdaily/secrets.json"
  if [[ -f "$SECRETS_FILE" ]]; then
    LINEAR_API_KEY=$(python3 -c "
import json, sys
try:
    d = json.load(open('$SECRETS_FILE'))
    print(d.get('linear', {}).get('apiKey', ''))
except:
    pass
" 2>/dev/null || true)
  fi
fi

HAS_LINEAR=false
if [[ -n "$LINEAR_TEAM_KEY" && -n "$LINEAR_API_KEY" ]]; then
  # Verify Linear connection
  LINEAR_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -d '{"query":"{ viewer { id } }"}' 2>/dev/null || echo "000")

  if [[ "$LINEAR_CHECK" == "200" ]]; then
    HAS_LINEAR=true
    success "Linear API connected (team: ${BOLD}${LINEAR_TEAM_KEY}${NC})"
  else
    warn "Linear API returned HTTP $LINEAR_CHECK — skipping Linear issues"
  fi
elif [[ -n "$LINEAR_TEAM_KEY" && -z "$LINEAR_API_KEY" ]]; then
  warn "LINEAR_TEAM_KEY set but no LINEAR_API_KEY found — skipping Linear"
  warn "Set LINEAR_API_KEY env var or add it to ~/.devdaily/secrets.json"
elif [[ -z "$LINEAR_TEAM_KEY" ]]; then
  info "No LINEAR_TEAM_KEY set — skipping Linear issues"
  info "To include Linear: LINEAR_TEAM_KEY=ENG ./scripts/setup-test-repo.sh"
fi

# ─── Define test tickets ─────────────────────────────────────────────────────

header "Test Ticket Definitions"

# Each ticket: title | description | type (bug/feature/task) | label
TICKETS=(
  "Fix login page crash on mobile Safari|The login form throws an unhandled exception on iOS Safari 17 when the password field gains focus. Stack trace points to an event listener on the autofill overlay.|bug|bug"
  "Add dark mode toggle to settings page|Users should be able to switch between light and dark mode from the settings panel. The toggle should persist preference to localStorage and apply the theme immediately without a page reload.|feature|enhancement"
  "Refactor user service to use repository pattern|The UserService currently has direct database calls mixed with business logic. Extract data access into a UserRepository class to improve testability and separation of concerns.|task|refactor"
  "API rate limiting returns wrong HTTP status code|When rate limit is exceeded the API returns 500 instead of 429 Too Many Requests. The error response body also lacks the Retry-After header.|bug|bug"
  "Add export to CSV for dashboard reports|Product wants users to be able to export the analytics dashboard data as CSV. Should support date range filtering and column selection.|feature|enhancement"
)

info "Defined ${#TICKETS[@]} test tickets"

# ─── Create GitHub repo ──────────────────────────────────────────────────────

header "GitHub Repository Setup"

# Check if repo already exists
if gh repo view "$REPO_FULL" &>/dev/null 2>&1; then
  warn "Repo ${BOLD}${REPO_FULL}${NC} already exists"
  read -r -p "  Delete and recreate? (y/N): " CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    gh repo delete "$REPO_FULL" --yes 2>/dev/null || true
    info "Deleted existing repo"
    sleep 2
  else
    error "Aborting. Delete the repo manually or set REPO_NAME to a different name."
    exit 1
  fi
fi

# Create the repo
gh repo create "$REPO_NAME" --public --description "DevDaily standup integration test repo" --clone=false
success "Created repo: ${BOLD}${REPO_FULL}${NC}"

# Clone locally
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"
git init
git remote add origin "https://github.com/${REPO_FULL}.git"

# Initial commit
cat > README.md << 'EOF'
# DevDaily Test Ground

This repository is used for testing [devdaily](https://github.com/himalpun/devdaily) standup generation
with real GitHub Issues and Linear integration.

## Structure

- `src/` — Dummy source files for generating realistic diffs
- `docs/` — Documentation files
- `tests/` — Test files

## Purpose

Each branch and PR in this repo references a ticket (GitHub Issue or Linear issue)
to test that `devdaily standup` correctly correlates commits ↔ PRs ↔ tickets.
EOF

mkdir -p src docs tests

cat > src/app.ts << 'EOF'
import { UserService } from './services/user-service';
import { DashboardService } from './services/dashboard-service';

export class App {
  private userService: UserService;
  private dashboardService: DashboardService;

  constructor() {
    this.userService = new UserService();
    this.dashboardService = new DashboardService();
  }

  async start() {
    console.log('App started');
  }
}
EOF

mkdir -p src/services src/components src/utils

cat > src/services/user-service.ts << 'EOF'
export class UserService {
  async getUser(id: string) {
    // Direct DB call — needs refactoring
    const db = await import('../utils/db');
    return db.query(`SELECT * FROM users WHERE id = $1`, [id]);
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    const db = await import('../utils/db');
    return db.query(`UPDATE users SET data = $1 WHERE id = $2`, [JSON.stringify(data), id]);
  }

  async deleteUser(id: string) {
    const db = await import('../utils/db');
    return db.query(`DELETE FROM users WHERE id = $1`, [id]);
  }
}
EOF

cat > src/services/dashboard-service.ts << 'EOF'
export class DashboardService {
  async getReports(dateFrom: string, dateTo: string) {
    return { dateFrom, dateTo, data: [] };
  }

  async getMetrics() {
    return { users: 0, sessions: 0, revenue: 0 };
  }
}
EOF

cat > src/components/LoginForm.tsx << 'EOF'
import React, { useState } from 'react';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}
EOF

cat > src/components/Settings.tsx << 'EOF'
import React from 'react';

export function Settings() {
  return (
    <div className="settings">
      <h1>Settings</h1>
      <section>
        <h2>Profile</h2>
        <p>Manage your profile settings</p>
      </section>
      <section>
        <h2>Notifications</h2>
        <p>Configure notification preferences</p>
      </section>
    </div>
  );
}
EOF

cat > src/utils/db.ts << 'EOF'
export async function query(sql: string, params: unknown[] = []) {
  // Placeholder DB utility
  console.log('Executing query:', sql, params);
  return { rows: [], rowCount: 0 };
}
EOF

cat > src/utils/api.ts << 'EOF'
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function rateLimitMiddleware(req: unknown, res: unknown, next: () => void) {
  // TODO: Implement proper rate limiting
  const remaining = 100;
  if (remaining <= 0) {
    // BUG: Returns 500 instead of 429
    throw new ApiError(500, 'Rate limit exceeded');
  }
  next();
}
EOF

git add -A
git commit -m "chore: initial project setup with base structure"
git branch -M main
git push -u origin main
success "Pushed initial commit to main"

# ─── Create GitHub Issues ────────────────────────────────────────────────────

header "Creating GitHub Issues"

declare -a GH_ISSUE_NUMS=()

for i in "${!TICKETS[@]}"; do
  IFS='|' read -r title desc type label <<< "${TICKETS[$i]}"

  ISSUE_NUM=$(gh issue create \
    --repo "$REPO_FULL" \
    --title "$title" \
    --body "$desc" \
    --label "$label" \
    2>/dev/null | grep -oE '[0-9]+$' || true)

  # If label doesn't exist, create without label and retry
  if [[ -z "$ISSUE_NUM" ]]; then
    gh label create "$label" --repo "$REPO_FULL" --color "$(printf '%06X' $((RANDOM * RANDOM % 16777215)))" 2>/dev/null || true
    ISSUE_NUM=$(gh issue create \
      --repo "$REPO_FULL" \
      --title "$title" \
      --body "$desc" \
      --label "$label" \
      2>/dev/null | grep -oE '[0-9]+$')
  fi

  GH_ISSUE_NUMS+=("$ISSUE_NUM")
  success "GitHub Issue #${ISSUE_NUM}: ${title:0:60}"
done

# ─── Create Linear Issues (optional) ─────────────────────────────────────────

declare -a LINEAR_ISSUE_IDS=()

if [[ "$HAS_LINEAR" == "true" ]]; then
  header "Creating Linear Issues"

  # Get team ID from team key
  LINEAR_TEAM_ID=$(curl -s \
    -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -d "{\"query\":\"{ teams(filter: { key: { eq: \\\"${LINEAR_TEAM_KEY}\\\" } }) { nodes { id name key } } }\"}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['teams']['nodes'][0]['id'])" 2>/dev/null || true)

  if [[ -z "$LINEAR_TEAM_ID" ]]; then
    warn "Could not find Linear team with key '${LINEAR_TEAM_KEY}'"
    warn "Available teams:"
    curl -s \
      -X POST https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: ${LINEAR_API_KEY}" \
      -d '{"query":"{ teams { nodes { key name } } }"}' \
      | python3 -c "
import json, sys
d = json.load(sys.stdin)
for t in d['data']['teams']['nodes']:
    print(f\"  - {t['key']}: {t['name']}\")
" 2>/dev/null || true
    warn "Skipping Linear issue creation"
  else
    success "Found Linear team: ${LINEAR_TEAM_KEY} (${LINEAR_TEAM_ID:0:8}...)"

    for i in "${!TICKETS[@]}"; do
      IFS='|' read -r title desc type label <<< "${TICKETS[$i]}"

      # Use a single python3 invocation with env vars to avoid nested quoting issues
      LINEAR_ID=$(TICKET_TITLE="$title" \
        TICKET_DESC="$desc" \
        TEAM_ID="$LINEAR_TEAM_ID" \
        API_KEY="$LINEAR_API_KEY" \
        python3 << 'PYEOF'
import json, os, urllib.request

query = """
mutation CreateIssue($teamId: String!, $title: String!, $description: String!) {
  issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
    success
    issue { id identifier title url }
  }
}
"""

payload = json.dumps({
    "query": query,
    "variables": {
        "teamId": os.environ["TEAM_ID"],
        "title": os.environ["TICKET_TITLE"],
        "description": os.environ["TICKET_DESC"],
    }
}).encode("utf-8")

req = urllib.request.Request(
    "https://api.linear.app/graphql",
    data=payload,
    headers={
        "Content-Type": "application/json",
        "Authorization": os.environ["API_KEY"],
    },
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    issue = data.get("data", {}).get("issueCreate", {}).get("issue", {})
    print(issue.get("identifier", ""))
except Exception:
    print("")
PYEOF
      )

      if [[ -n "$LINEAR_ID" ]]; then
        LINEAR_ISSUE_IDS+=("$LINEAR_ID")
        success "Linear ${LINEAR_ID}: ${title:0:60}"
      else
        warn "Failed to create Linear issue: ${title:0:40}"
        LINEAR_ISSUE_IDS+=("")
      fi
    done
  fi
fi

# ─── Create branches, commits, and PRs ───────────────────────────────────────

header "Creating Branches, Commits & PRs"

# Make sure we're on main and up to date
cd "$WORK_DIR"
git checkout main 2>/dev/null

# ── Ticket 1: Fix login page crash (bug)
BRANCH_1="fix/${GH_ISSUE_NUMS[0]}-login-page-crash-mobile-safari"
if [[ -n "${LINEAR_ISSUE_IDS[0]:-}" ]]; then
  BRANCH_1="fix/${LINEAR_ISSUE_IDS[0]}-login-page-crash-mobile-safari"
fi

git checkout -b "$BRANCH_1"

cat > src/components/LoginForm.tsx << 'EOF'
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  // Fix: Prevent autofill overlay crash on iOS Safari 17
  // Safari fires a non-standard 'beforeinput' event on autofill that
  // can crash if the input isn't properly mounted yet
  useEffect(() => {
    const input = passwordRef.current;
    if (!input) return;

    const handleBeforeInput = (e: Event) => {
      // Guard against Safari autofill race condition
      if (!document.contains(input)) {
        e.preventDefault();
        return;
      }
    };

    input.addEventListener('beforeinput', handleBeforeInput);
    return () => input.removeEventListener('beforeinput', handleBeforeInput);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit(email, password);
    },
    [email, password, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} autoComplete="on">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        inputMode="email"
      />
      <input
        ref={passwordRef}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      <button type="submit">Login</button>
    </form>
  );
}
EOF

git add -A
COMMIT_MSG_1="fix: prevent autofill crash on iOS Safari 17 login form

Closes #${GH_ISSUE_NUMS[0]}

Safari 17 fires a non-standard 'beforeinput' event during autofill
that crashes when the password input isn't fully mounted. Added a
guard in useEffect to prevent the event from propagating in that
race condition."
if [[ -n "${LINEAR_ISSUE_IDS[0]:-}" ]]; then
  COMMIT_MSG_1="fix: prevent autofill crash on iOS Safari 17 login form

Closes #${GH_ISSUE_NUMS[0]}
Ref: ${LINEAR_ISSUE_IDS[0]}

Safari 17 fires a non-standard 'beforeinput' event during autofill
that crashes when the password input isn't fully mounted. Added a
guard in useEffect to prevent the event from propagating in that
race condition."
fi
git commit -m "$COMMIT_MSG_1"

cat > tests/login-form.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';

describe('LoginForm', () => {
  it('should handle autofill events safely', () => {
    // Verify the beforeinput handler doesn't throw when element is detached
    expect(true).toBe(true);
  });

  it('should submit email and password', () => {
    expect(true).toBe(true);
  });
});
EOF

git add -A
git commit -m "test: add login form autofill safety tests"

git push -u origin "$BRANCH_1"
PR_URL_1=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "fix: Login page crash on mobile Safari (#${GH_ISSUE_NUMS[0]})" \
  --body "## Summary
Fixes the autofill crash on iOS Safari 17.

## Changes
- Added \`beforeinput\` event guard in \`useEffect\` to handle Safari autofill race condition
- Added \`autoComplete\` attributes for proper autofill behavior
- Wrapped \`handleSubmit\` in \`useCallback\` for performance

## Testing
- Tested on iOS Safari 17.2 simulator — no crash on autofill
- Desktop Safari/Chrome/Firefox unaffected

Closes #${GH_ISSUE_NUMS[0]}$([ -n "${LINEAR_ISSUE_IDS[0]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[0]}")" \
  --head "$BRANCH_1" \
  --base main)
success "PR created: $PR_URL_1"
sleep 1

# Merge this PR
gh pr merge "$PR_URL_1" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || true
success "Merged PR #1"
sleep 1

# ── Ticket 2: Dark mode toggle (feature)
git checkout main && git pull origin main

BRANCH_2="feature/${GH_ISSUE_NUMS[1]}-dark-mode-settings"
if [[ -n "${LINEAR_ISSUE_IDS[1]:-}" ]]; then
  BRANCH_2="feature/${LINEAR_ISSUE_IDS[1]}-dark-mode-settings"
fi

git checkout -b "$BRANCH_2"

cat > src/utils/theme.ts << 'EOF'
export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'user-theme-preference';

export function getThemePreference(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function setThemePreference(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

export function applyTheme(mode: ThemeMode): void {
  const prefersDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light';
}

export function initTheme(): void {
  const preference = getThemePreference();
  applyTheme(preference);

  // Listen for system theme changes when in 'system' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
    }
  });
}
EOF

cat > src/components/Settings.tsx << 'EOF'
import React, { useState, useEffect } from 'react';
import { getThemePreference, setThemePreference, type ThemeMode } from '../utils/theme';

export function Settings() {
  const [theme, setTheme] = useState<ThemeMode>(getThemePreference());

  useEffect(() => {
    setThemePreference(theme);
  }, [theme]);

  return (
    <div className="settings">
      <h1>Settings</h1>
      <section>
        <h2>Appearance</h2>
        <div className="theme-toggle">
          <label htmlFor="theme-select">Theme</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeMode)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>
      </section>
      <section>
        <h2>Profile</h2>
        <p>Manage your profile settings</p>
      </section>
      <section>
        <h2>Notifications</h2>
        <p>Configure notification preferences</p>
      </section>
    </div>
  );
}
EOF

git add -A
COMMIT_MSG_2="feat: add dark mode toggle to settings page

Closes #${GH_ISSUE_NUMS[1]}$([ -n "${LINEAR_ISSUE_IDS[1]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[1]}")

- Added theme utility with light/dark/system modes
- Persists preference to localStorage
- Applies theme immediately via data-theme attribute
- Listens for system preference changes in 'system' mode"
git commit -m "$COMMIT_MSG_2"

git push -u origin "$BRANCH_2"
PR_URL_2=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "feat: Dark mode toggle in settings (#${GH_ISSUE_NUMS[1]})" \
  --body "## Summary
Adds a dark mode toggle to the Settings page.

## Changes
- New \`src/utils/theme.ts\` — theme preference management (localStorage + CSS)
- Updated \`Settings.tsx\` — added theme selector dropdown
- Supports light / dark / system (follows OS preference)
- Theme applies instantly without page reload

Closes #${GH_ISSUE_NUMS[1]}$([ -n "${LINEAR_ISSUE_IDS[1]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[1]}")" \
  --head "$BRANCH_2" \
  --base main)
success "PR created: $PR_URL_2"
sleep 1

gh pr merge "$PR_URL_2" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || true
success "Merged PR #2"
sleep 1

# ── Ticket 3: Refactor user service (task)
git checkout main && git pull origin main

BRANCH_3="refactor/${GH_ISSUE_NUMS[2]}-user-service-repository-pattern"
if [[ -n "${LINEAR_ISSUE_IDS[2]:-}" ]]; then
  BRANCH_3="refactor/${LINEAR_ISSUE_IDS[2]}-user-service-repository-pattern"
fi

git checkout -b "$BRANCH_3"

cat > src/services/user-repository.ts << 'EOF'
import { query } from '../utils/db';

export interface User {
  id: string;
  email: string;
  name: string;
  data: Record<string, unknown>;
}

/**
 * UserRepository — handles all direct database access for user entities.
 * Extracted from UserService to improve testability and separation of concerns.
 */
export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows?.[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows?.[0] ?? null;
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const result = await query(
      'UPDATE users SET data = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(data), id],
    );
    return result.rows?.[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    const result = await query(
      'INSERT INTO users (email, name, data) VALUES ($1, $2, $3) RETURNING *',
      [user.email, user.name, JSON.stringify(user.data)],
    );
    return result.rows[0];
  }
}
EOF

cat > src/services/user-service.ts << 'EOF'
import { UserRepository, type User } from './user-repository';

/**
 * UserService — business logic layer for user operations.
 * Delegates data access to UserRepository.
 */
export class UserService {
  private repo: UserRepository;

  constructor(repo?: UserRepository) {
    this.repo = repo ?? new UserRepository();
  }

  async getUser(id: string): Promise<User | null> {
    return this.repo.findById(id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(email);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new Error(`User ${id} not found`);
    }
    return this.repo.update(id, data);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }
}
EOF

cat > tests/user-service.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should delegate getUser to repository', () => {
    expect(true).toBe(true);
  });

  it('should throw when updating non-existent user', () => {
    expect(true).toBe(true);
  });
});
EOF

git add -A
COMMIT_MSG_3="refactor: extract UserRepository from UserService

Closes #${GH_ISSUE_NUMS[2]}$([ -n "${LINEAR_ISSUE_IDS[2]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[2]}")

- Created UserRepository with findById, findByEmail, update, delete, create
- UserService now delegates all DB access to UserRepository
- UserService constructor accepts optional repo for dependency injection
- Added placeholder tests for the new service layer"
git commit -m "$COMMIT_MSG_3"

git push -u origin "$BRANCH_3"
PR_URL_3=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "refactor: User service repository pattern (#${GH_ISSUE_NUMS[2]})" \
  --body "## Summary
Refactors UserService to use the repository pattern.

## Changes
- New \`UserRepository\` class handles all direct DB queries
- \`UserService\` now contains only business logic, delegates to repo
- Constructor injection for testability
- Added initial test stubs

## Why
The old UserService mixed database queries with business logic, making it hard to test
and violating single responsibility principle.

Closes #${GH_ISSUE_NUMS[2]}$([ -n "${LINEAR_ISSUE_IDS[2]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[2]}")" \
  --head "$BRANCH_3" \
  --base main)
success "PR created: $PR_URL_3"
sleep 1

gh pr merge "$PR_URL_3" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || true
success "Merged PR #3"
sleep 1

# ── Ticket 4: Fix rate limiting status code (bug)
git checkout main && git pull origin main

BRANCH_4="fix/${GH_ISSUE_NUMS[3]}-rate-limit-wrong-status"
if [[ -n "${LINEAR_ISSUE_IDS[3]:-}" ]]; then
  BRANCH_4="fix/${LINEAR_ISSUE_IDS[3]}-rate-limit-wrong-status"
fi

git checkout -b "$BRANCH_4"

cat > src/utils/api.ts << 'EOF'
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
    };
  }
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

const RATE_LIMIT = 100;
const WINDOW_MS = 60 * 1000; // 1 minute
const rateLimitMap = new Map<string, RateLimitState>();

export function rateLimitMiddleware(req: any, res: any, next: () => void) {
  const clientId = req.ip || req.headers?.['x-forwarded-for'] || 'unknown';
  const now = Date.now();

  let state = rateLimitMap.get(clientId);
  if (!state || now > state.resetAt) {
    state = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitMap.set(clientId, state);
  }

  state.count++;

  // Set rate limit headers
  const remaining = Math.max(0, RATE_LIMIT - state.count);
  const retryAfterSec = Math.ceil((state.resetAt - now) / 1000);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(state.resetAt / 1000));

  if (state.count > RATE_LIMIT) {
    // Fixed: Return 429 Too Many Requests (was incorrectly returning 500)
    res.setHeader('Retry-After', retryAfterSec);
    throw new ApiError(429, 'Too Many Requests — rate limit exceeded', retryAfterSec);
  }

  next();
}
EOF

cat > tests/rate-limit.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';

describe('rateLimitMiddleware', () => {
  it('should return 429 when rate limit exceeded', () => {
    // The middleware should throw ApiError with statusCode 429, not 500
    expect(429).not.toBe(500);
  });

  it('should include Retry-After header', () => {
    expect(true).toBe(true);
  });
});
EOF

git add -A
COMMIT_MSG_4="fix: return 429 instead of 500 on rate limit exceeded

Closes #${GH_ISSUE_NUMS[3]}$([ -n "${LINEAR_ISSUE_IDS[3]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[3]}")

- Changed rate limit error from 500 to 429 (Too Many Requests)
- Added Retry-After header with seconds until reset
- Added X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
- Added retryAfter field to ApiError class and toJSON output
- Implemented per-client rate tracking with sliding window"
git commit -m "$COMMIT_MSG_4"

git push -u origin "$BRANCH_4"
PR_URL_4=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "fix: Rate limiting returns correct 429 status (#${GH_ISSUE_NUMS[3]})" \
  --body "## Summary
Fixes the rate limiter to return HTTP 429 instead of 500.

## Changes
- Return \`429 Too Many Requests\` instead of \`500 Internal Server Error\`
- Added \`Retry-After\` header
- Added standard rate limit headers (\`X-RateLimit-*\`)
- Implemented per-client tracking with a sliding window

## Before
\`\`\`
HTTP/1.1 500 Internal Server Error
{\"error\": \"Rate limit exceeded\"}
\`\`\`

## After
\`\`\`
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Remaining: 0
{\"error\": \"Too Many Requests\", \"retryAfter\": 45}
\`\`\`

Closes #${GH_ISSUE_NUMS[3]}$([ -n "${LINEAR_ISSUE_IDS[3]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[3]}")" \
  --head "$BRANCH_4" \
  --base main)
success "PR created: $PR_URL_4"
sleep 1

gh pr merge "$PR_URL_4" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || true
success "Merged PR #4"
sleep 1

# ── Ticket 5: CSV export for dashboard (feature) — leave this one OPEN
git checkout main && git pull origin main

BRANCH_5="feature/${GH_ISSUE_NUMS[4]}-dashboard-csv-export"
if [[ -n "${LINEAR_ISSUE_IDS[4]:-}" ]]; then
  BRANCH_5="feature/${LINEAR_ISSUE_IDS[4]}-dashboard-csv-export"
fi

git checkout -b "$BRANCH_5"

cat > src/utils/csv.ts << 'EOF'
/**
 * CSV Export utility
 */
export interface CsvOptions {
  columns?: string[];
  dateFrom?: string;
  dateTo?: string;
  delimiter?: string;
}

export function arrayToCsv(
  data: Record<string, unknown>[],
  options: CsvOptions = {},
): string {
  if (data.length === 0) return '';

  const delimiter = options.delimiter ?? ',';
  const columns = options.columns ?? Object.keys(data[0]);

  const header = columns.map(escapeField).join(delimiter);
  const rows = data.map((row) =>
    columns.map((col) => escapeField(String(row[col] ?? ''))).join(delimiter),
  );

  return [header, ...rows].join('\n');
}

function escapeField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
EOF

cat > src/services/dashboard-service.ts << 'EOF'
import { arrayToCsv, downloadCsv, type CsvOptions } from '../utils/csv';

interface ReportRow {
  date: string;
  metric: string;
  value: number;
  category: string;
}

export class DashboardService {
  async getReports(dateFrom: string, dateTo: string): Promise<ReportRow[]> {
    // Placeholder — would fetch from API
    return [
      { date: dateFrom, metric: 'page_views', value: 1250, category: 'engagement' },
      { date: dateFrom, metric: 'signups', value: 42, category: 'growth' },
      { date: dateTo, metric: 'page_views', value: 1380, category: 'engagement' },
      { date: dateTo, metric: 'signups', value: 51, category: 'growth' },
    ];
  }

  async getMetrics() {
    return { users: 1520, sessions: 4230, revenue: 12450.0 };
  }

  async exportToCsv(dateFrom: string, dateTo: string, options?: CsvOptions): Promise<string> {
    const reports = await this.getReports(dateFrom, dateTo);
    return arrayToCsv(reports, {
      ...options,
      dateFrom,
      dateTo,
    });
  }

  async downloadReport(dateFrom: string, dateTo: string, options?: CsvOptions): Promise<void> {
    const csv = await this.exportToCsv(dateFrom, dateTo, options);
    const filename = `report_${dateFrom}_${dateTo}.csv`;
    downloadCsv(csv, filename);
  }
}
EOF

git add -A
COMMIT_MSG_5="feat(wip): add CSV export utility and dashboard export

Ref #${GH_ISSUE_NUMS[4]}$([ -n "${LINEAR_ISSUE_IDS[4]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[4]}")

- Added generic CSV utility with column selection and field escaping
- Added downloadCsv helper for browser-side downloads
- Extended DashboardService with exportToCsv and downloadReport methods
- Still needs: date range filter UI and column picker component"
git commit -m "$COMMIT_MSG_5"

git push -u origin "$BRANCH_5"
PR_URL_5=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "feat: CSV export for dashboard reports (WIP) (#${GH_ISSUE_NUMS[4]})" \
  --body "## Summary
WIP — Adds CSV export functionality for dashboard reports.

## Done
- [x] CSV utility with proper escaping and column selection
- [x] DashboardService export methods
- [x] Browser download helper

## TODO
- [ ] Date range picker UI component
- [ ] Column selection dropdown
- [ ] Loading state and error handling in UI

Ref #${GH_ISSUE_NUMS[4]}$([ -n "${LINEAR_ISSUE_IDS[4]:-}" ] && echo "
Ref: ${LINEAR_ISSUE_IDS[4]}")

⚠️ **Draft — not ready for review**" \
  --head "$BRANCH_5" \
  --base main \
  --draft)
success "PR created (draft): $PR_URL_5"

# ─── Set up devdaily config in the test repo ─────────────────────────────────

header "DevDaily Configuration"

# Create local .devdaily.json config
cat > "$WORK_DIR/.devdaily.json" << EOF
{
  "projectManagement": {
    "tool": "github",
    "ticketPrefix": ""
  }
}
EOF
success "Created .devdaily.json (tool: github)"

if [[ "$HAS_LINEAR" == "true" ]]; then
  info ""
  info "To test with Linear instead, update .devdaily.json:"
  info "  {\"projectManagement\": {\"tool\": \"linear\", \"ticketPrefix\": \"${LINEAR_TEAM_KEY}\"}}"
  info ""
  info "And ensure LINEAR_API_KEY is set in ~/.devdaily/secrets.json:"
  info "  {\"linear\": {\"apiKey\": \"lin_api_...\"}}"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

header "Setup Complete! 🎉"

echo -e "${BOLD}Repository:${NC}  https://github.com/${REPO_FULL}"
echo -e "${BOLD}Local path:${NC}  ${WORK_DIR}"
echo ""
echo -e "${BOLD}GitHub Issues:${NC}"
for i in "${!GH_ISSUE_NUMS[@]}"; do
  IFS='|' read -r title _ _ _ <<< "${TICKETS[$i]}"
  echo -e "  #${GH_ISSUE_NUMS[$i]}: ${title:0:65}"
done

if [[ "$HAS_LINEAR" == "true" && ${#LINEAR_ISSUE_IDS[@]} -gt 0 ]]; then
  echo ""
  echo -e "${BOLD}Linear Issues:${NC}"
  for i in "${!LINEAR_ISSUE_IDS[@]}"; do
    if [[ -n "${LINEAR_ISSUE_IDS[$i]}" ]]; then
      IFS='|' read -r title _ _ _ <<< "${TICKETS[$i]}"
      echo -e "  ${LINEAR_ISSUE_IDS[$i]}: ${title:0:65}"
    fi
  done
fi

echo ""
echo -e "${BOLD}PRs:${NC}"
echo -e "  4 merged, 1 open (draft)"
echo ""
echo -e "${BOLD}Now test devdaily:${NC}"
echo ""
echo -e "  ${CYAN}cd ${WORK_DIR}${NC}"
echo ""
echo -e "  # Test with GitHub Issues PM:"
echo -e "  ${CYAN}devdaily standup --days 7 --raw-context${NC}"
echo -e "  ${CYAN}devdaily standup --days 7 --debug${NC}"
echo -e "  ${CYAN}devdaily standup --days 7${NC}"
echo ""

if [[ "$HAS_LINEAR" == "true" ]]; then
  echo -e "  # Switch to Linear PM and re-test:"
  echo -e "  ${CYAN}# Edit .devdaily.json → tool: \"linear\", ticketPrefix: \"${LINEAR_TEAM_KEY}\"${NC}"
  echo -e "  ${CYAN}devdaily standup --days 7 --raw-context${NC}"
  echo ""
fi

echo -e "  # Cleanup when done:"
echo -e "  ${CYAN}gh repo delete ${REPO_FULL} --yes${NC}"
echo -e "  ${CYAN}rm -rf ${WORK_DIR}${NC}"
echo ""
