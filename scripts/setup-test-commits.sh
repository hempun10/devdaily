#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# DevDaily Test Commits Setup
#
# Creates branches, commits, and PRs in the devdaily-test-ground repo
# referencing both GitHub Issues (#1-#5) and Linear issues (HEM-54 to HEM-58).
#
# Prerequisites:
#   - The repo hempun10/devdaily-test-ground must already exist with issues
#   - gh CLI authenticated
#
# Usage:
#   chmod +x scripts/setup-test-commits.sh
#   ./scripts/setup-test-commits.sh
# ─────────────────────────────────────────────────────────────────────────────

REPO_NAME="devdaily-test-ground"
REPO_OWNER="hempun10"
REPO_FULL="${REPO_OWNER}/${REPO_NAME}"
WORK_DIR="/tmp/${REPO_NAME}"

# GitHub Issue numbers
GH_1=1  # Fix login page crash on mobile Safari
GH_2=2  # Add dark mode toggle to settings page
GH_3=3  # Refactor user service to use repository pattern
GH_4=4  # API rate limiting returns wrong HTTP status code
GH_5=5  # Add export to CSV for dashboard reports

# Linear Issue identifiers
LIN_1="HEM-54"  # Fix login page crash on mobile Safari
LIN_2="HEM-55"  # Add dark mode toggle to settings page
LIN_3="HEM-56"  # Refactor user service to use repository pattern
LIN_4="HEM-57"  # API rate limiting returns wrong HTTP status code
LIN_5="HEM-58"  # Add export to CSV for dashboard reports

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

# ─── Preflight ────────────────────────────────────────────────────────────────

header "Preflight"

if ! gh repo view "$REPO_FULL" &>/dev/null 2>&1; then
  error "Repo ${REPO_FULL} not found. Run setup-test-repo.sh first."
  exit 1
fi
success "Repo ${BOLD}${REPO_FULL}${NC} exists"

# Clone fresh
if [[ -d "$WORK_DIR" ]]; then
  rm -rf "$WORK_DIR"
fi
gh repo clone "$REPO_FULL" "$WORK_DIR" -- --depth=50 2>/dev/null
cd "$WORK_DIR"
git checkout main
success "Cloned to ${WORK_DIR}"

# ─── Ticket 1: Fix login page crash (bug) — MERGED ──────────────────────────

header "PR 1: Fix login page crash on mobile Safari (bug)"

BRANCH_1="fix/${LIN_1}-login-page-crash-mobile-safari"
git checkout -b "$BRANCH_1" main

cat > src/components/LoginForm.tsx << 'SRCEOF'
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
SRCEOF

git add -A
git commit -m "fix: prevent autofill crash on iOS Safari 17 login form

Closes #${GH_1}
Ref: ${LIN_1}

Safari 17 fires a non-standard 'beforeinput' event during autofill
that crashes when the password input isn't fully mounted. Added a
guard in useEffect to prevent the event from propagating in that
race condition."

mkdir -p tests
cat > tests/login-form.test.ts << 'SRCEOF'
import { describe, it, expect } from 'vitest';

describe('LoginForm', () => {
  it('should handle autofill events safely on iOS Safari', () => {
    // Verify the beforeinput handler doesn't throw when element is detached
    expect(true).toBe(true);
  });

  it('should submit email and password on form submit', () => {
    expect(true).toBe(true);
  });
});
SRCEOF

git add -A
git commit -m "test: add login form autofill safety tests

${LIN_1}"

git push -u origin "$BRANCH_1"
PR_URL_1=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "fix: Login page crash on mobile Safari [${LIN_1}]" \
  --body "## Summary
Fixes the autofill crash on iOS Safari 17.

## Changes
- Added \`beforeinput\` event guard in \`useEffect\` to handle Safari autofill race condition
- Added \`autoComplete\` attributes for proper autofill behavior
- Wrapped \`handleSubmit\` in \`useCallback\` for performance
- Added test coverage for autofill edge case

## Testing
- Tested on iOS Safari 17.2 simulator — no crash on autofill
- Desktop Safari/Chrome/Firefox unaffected

Closes #${GH_1}
Ref: ${LIN_1}" \
  --head "$BRANCH_1" \
  --base main)
success "PR created: $PR_URL_1"
sleep 2

gh pr merge "$PR_URL_1" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || warn "Could not auto-merge PR 1"
success "Merged PR 1"
sleep 2

# ─── Ticket 2: Dark mode toggle (feature) — MERGED ──────────────────────────

header "PR 2: Add dark mode toggle to settings page (feature)"

git checkout main && git pull origin main

BRANCH_2="feature/${LIN_2}-dark-mode-settings"
git checkout -b "$BRANCH_2" main

mkdir -p src/utils
cat > src/utils/theme.ts << 'SRCEOF'
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
SRCEOF

git add -A
git commit -m "feat: add theme utility with light/dark/system modes

Ref: ${LIN_2}

- Persists preference to localStorage under 'user-theme-preference'
- Applies theme via data-theme attribute and colorScheme CSS property
- Listens for system preference changes when in 'system' mode"

cat > src/components/Settings.tsx << 'SRCEOF'
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
SRCEOF

git add -A
git commit -m "feat: add dark mode toggle to settings page

Closes #${GH_2}
Ref: ${LIN_2}

- Added ThemeMode selector (light/dark/system) in Settings
- Theme preference persists to localStorage
- Applies immediately without page reload
- Respects OS-level dark mode when set to 'system'"

git push -u origin "$BRANCH_2"
PR_URL_2=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "feat: Dark mode toggle in settings [${LIN_2}]" \
  --body "## Summary
Adds a dark mode toggle to the Settings page.

## Changes
- New \`src/utils/theme.ts\` — theme preference management (localStorage + CSS)
- Updated \`Settings.tsx\` — added theme selector dropdown
- Supports light / dark / system (follows OS preference)
- Theme applies instantly without page reload

Closes #${GH_2}
Ref: ${LIN_2}" \
  --head "$BRANCH_2" \
  --base main)
success "PR created: $PR_URL_2"
sleep 2

gh pr merge "$PR_URL_2" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || warn "Could not auto-merge PR 2"
success "Merged PR 2"
sleep 2

# ─── Ticket 3: Refactor user service (task) — MERGED ────────────────────────

header "PR 3: Refactor user service to repository pattern (task)"

git checkout main && git pull origin main

BRANCH_3="refactor/${LIN_3}-user-service-repository-pattern"
git checkout -b "$BRANCH_3" main

mkdir -p src/services
cat > src/services/user-repository.ts << 'SRCEOF'
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
SRCEOF

git add -A
git commit -m "refactor: extract UserRepository from UserService

Ref: ${LIN_3}

- Created UserRepository with findById, findByEmail, update, delete, create
- All raw SQL queries now live in the repository layer
- Prepares for dependency injection in UserService"

cat > src/services/user-service.ts << 'SRCEOF'
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
SRCEOF

cat > tests/user-service.test.ts << 'SRCEOF'
import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should delegate getUser to repository', () => {
    // With repository pattern we can inject a mock repository
    expect(true).toBe(true);
  });

  it('should throw when updating non-existent user', () => {
    expect(true).toBe(true);
  });

  it('should delegate delete to repository', () => {
    expect(true).toBe(true);
  });
});
SRCEOF

git add -A
git commit -m "refactor: UserService now delegates to UserRepository

Closes #${GH_3}
Ref: ${LIN_3}

- UserService constructor accepts optional repo for dependency injection
- Business logic separated from data access
- Added placeholder tests for the refactored service layer
- No behavior changes — pure structural refactor"

git push -u origin "$BRANCH_3"
PR_URL_3=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "refactor: User service repository pattern [${LIN_3}]" \
  --body "## Summary
Refactors UserService to use the repository pattern for better separation of concerns.

## Changes
- New \`UserRepository\` class handles all direct DB queries
- \`UserService\` now contains only business logic, delegates data access to repo
- Constructor injection for testability (\`new UserService(mockRepo)\`)
- Added initial test stubs for the service layer

## Why
The old UserService mixed database queries with business logic, making it hard to
test and violating single responsibility principle.

Closes #${GH_3}
Ref: ${LIN_3}" \
  --head "$BRANCH_3" \
  --base main)
success "PR created: $PR_URL_3"
sleep 2

gh pr merge "$PR_URL_3" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || warn "Could not auto-merge PR 3"
success "Merged PR 3"
sleep 2

# ─── Ticket 4: Fix rate limiting status code (bug) — MERGED ─────────────────

header "PR 4: Fix rate limiting HTTP status code (bug)"

git checkout main && git pull origin main

BRANCH_4="fix/${LIN_4}-rate-limit-wrong-status"
git checkout -b "$BRANCH_4" main

cat > src/utils/api.ts << 'SRCEOF'
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

  // Set standard rate limit headers
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
SRCEOF

git add -A
git commit -m "fix: return 429 instead of 500 on rate limit exceeded

Closes #${GH_4}
Ref: ${LIN_4}

- Changed rate limit error from HTTP 500 to 429 (Too Many Requests)
- Added Retry-After header with seconds until window reset
- Added X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
- Added retryAfter field to ApiError class and toJSON serialization
- Implemented per-client rate tracking with sliding time window"

cat > tests/rate-limit.test.ts << 'SRCEOF'
import { describe, it, expect } from 'vitest';

describe('rateLimitMiddleware', () => {
  it('should return 429 when rate limit exceeded', () => {
    // The middleware now correctly throws ApiError with statusCode 429
    expect(429).not.toBe(500);
  });

  it('should include Retry-After header in 429 response', () => {
    expect(true).toBe(true);
  });

  it('should set standard X-RateLimit-* headers', () => {
    expect(true).toBe(true);
  });

  it('should track rate limits per client IP', () => {
    expect(true).toBe(true);
  });
});
SRCEOF

git add -A
git commit -m "test: add rate limiting middleware tests

${LIN_4}"

git push -u origin "$BRANCH_4"
PR_URL_4=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "fix: Rate limiting returns correct 429 status [${LIN_4}]" \
  --body "## Summary
Fixes the rate limiter to return HTTP 429 instead of 500 when limit is exceeded.

## Changes
- Return \`429 Too Many Requests\` instead of \`500 Internal Server Error\`
- Added \`Retry-After\` header with seconds until window reset
- Added standard rate limit headers (\`X-RateLimit-*\`)
- Implemented per-client tracking with a sliding window
- Added test coverage

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
{\"error\": \"Too Many Requests\", \"statusCode\": 429, \"retryAfter\": 45}
\`\`\`

Closes #${GH_4}
Ref: ${LIN_4}" \
  --head "$BRANCH_4" \
  --base main)
success "PR created: $PR_URL_4"
sleep 2

gh pr merge "$PR_URL_4" --repo "$REPO_FULL" --squash --delete-branch 2>/dev/null || warn "Could not auto-merge PR 4"
success "Merged PR 4"
sleep 2

# ─── Ticket 5: CSV export for dashboard (feature) — OPEN DRAFT ──────────────

header "PR 5: CSV export for dashboard reports (feature, draft)"

git checkout main && git pull origin main

BRANCH_5="feature/${LIN_5}-dashboard-csv-export"
git checkout -b "$BRANCH_5" main

mkdir -p src/utils
cat > src/utils/csv.ts << 'SRCEOF'
/**
 * CSV Export utility — generic, reusable CSV generation.
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
SRCEOF

git add -A
git commit -m "feat: add generic CSV export utility

Ref #${GH_5}
Ref: ${LIN_5}

- arrayToCsv: converts array of objects to CSV string
- Supports column selection, custom delimiter
- Proper field escaping (quotes, commas, newlines)
- downloadCsv: browser-side download via Blob URL"

cat > src/services/dashboard-service.ts << 'SRCEOF'
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
SRCEOF

git add -A
git commit -m "feat(wip): integrate CSV export into DashboardService

Ref #${GH_5}
Ref: ${LIN_5}

- DashboardService.exportToCsv returns CSV string for date range
- DashboardService.downloadReport triggers browser download
- Still needs: date range picker UI and column selector component"

git push -u origin "$BRANCH_5"
PR_URL_5=$(gh pr create \
  --repo "$REPO_FULL" \
  --title "feat: CSV export for dashboard reports (WIP) [${LIN_5}]" \
  --body "## Summary
WIP — Adds CSV export functionality for dashboard reports.

## Done
- [x] Generic CSV utility with proper escaping and column selection
- [x] DashboardService export methods (exportToCsv, downloadReport)
- [x] Browser download helper via Blob URL

## TODO
- [ ] Date range picker UI component
- [ ] Column selection dropdown
- [ ] Loading state and error handling in UI
- [ ] Unit tests for CSV utility edge cases

Ref #${GH_5}
Ref: ${LIN_5}

> **Draft — not ready for review**" \
  --head "$BRANCH_5" \
  --base main \
  --draft)
success "PR created (draft): $PR_URL_5"

# ─── Set up devdaily config ──────────────────────────────────────────────────

header "DevDaily Configuration"

# GitHub Issues config
cat > "$WORK_DIR/.devdaily.json" << 'CFGEOF'
{
  "projectManagement": {
    "tool": "github",
    "ticketPrefix": ""
  }
}
CFGEOF
success "Created .devdaily.json (tool: github)"

# Also prepare a Linear config for easy switching
cat > "$WORK_DIR/.devdaily.linear.json" << 'CFGEOF'
{
  "projectManagement": {
    "tool": "linear",
    "ticketPrefix": "HEM"
  }
}
CFGEOF
success "Created .devdaily.linear.json (copy to .devdaily.json to switch)"

# ─── Summary ──────────────────────────────────────────────────────────────────

header "Setup Complete! 🎉"

echo -e "${BOLD}Repository:${NC}  https://github.com/${REPO_FULL}"
echo -e "${BOLD}Local path:${NC}  ${WORK_DIR}"
echo ""
echo -e "${BOLD}GitHub Issues:${NC}"
echo -e "  #${GH_1}: Fix login page crash on mobile Safari"
echo -e "  #${GH_2}: Add dark mode toggle to settings page"
echo -e "  #${GH_3}: Refactor user service to use repository pattern"
echo -e "  #${GH_4}: API rate limiting returns wrong HTTP status code"
echo -e "  #${GH_5}: Add export to CSV for dashboard reports"
echo ""
echo -e "${BOLD}Linear Issues:${NC}"
echo -e "  ${LIN_1}: Fix login page crash on mobile Safari"
echo -e "  ${LIN_2}: Add dark mode toggle to settings page"
echo -e "  ${LIN_3}: Refactor user service to use repository pattern"
echo -e "  ${LIN_4}: API rate limiting returns wrong HTTP status code"
echo -e "  ${LIN_5}: Add export to CSV for dashboard reports"
echo ""
echo -e "${BOLD}PRs:${NC}"
echo -e "  4 merged (squash), 1 open (draft)"
echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BOLD}Test with GitHub Issues PM:${NC}"
echo -e "  ${CYAN}cd ${WORK_DIR}${NC}"
echo -e "  ${CYAN}devdaily standup --days 7 --raw-context${NC}"
echo -e "  ${CYAN}devdaily standup --days 7 --debug${NC}"
echo -e "  ${CYAN}devdaily standup --days 7${NC}"
echo ""
echo -e "${BOLD}Switch to Linear PM and re-test:${NC}"
echo -e "  ${CYAN}cp .devdaily.linear.json .devdaily.json${NC}"
echo -e "  ${CYAN}devdaily standup --days 7 --raw-context${NC}"
echo -e "  ${CYAN}devdaily standup --days 7 --debug${NC}"
echo -e "  ${CYAN}devdaily standup --days 7${NC}"
echo ""
echo -e "${BOLD}Cleanup when done:${NC}"
echo -e "  ${CYAN}gh repo delete ${REPO_FULL} --yes${NC}"
echo -e "  ${CYAN}rm -rf ${WORK_DIR}${NC}"
echo ""
