import { describe, it, expect } from 'vitest';
import { StandupContextBuilder } from '../src/core/standup-context.js';
import type {
  StandupContext,
  CommitDetail,
  PRInfo,
  FileChange,
} from '../src/core/standup-context.js';
import type { Ticket } from '../src/core/project-management.js';
import type { WorkCategory } from '../src/core/context-analyzer.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeCommit(overrides: Partial<CommitDetail> = {}): CommitDetail {
  return {
    hash: 'abc1234567890',
    shortHash: 'abc1234',
    message: 'fix: resolve timezone display issue in customer portal',
    author: 'Test Dev',
    date: new Date('2025-01-15T10:30:00Z'),
    ...overrides,
  };
}

function makePR(overrides: Partial<PRInfo> = {}): PRInfo {
  return {
    number: 42,
    title: 'Fix timezone display in customer portal',
    body: 'This PR fixes the timezone rendering issue reported in PROJ-101. Customers were seeing UTC times instead of local.',
    state: 'merged',
    labels: ['bug', 'customer-facing'],
    url: 'https://github.com/org/repo/pull/42',
    baseBranch: 'main',
    headBranch: 'fix/PROJ-101-timezone',
    linkedTickets: ['PROJ-101'],
    ...overrides,
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'PROJ-101',
    title: 'Timezone display incorrect in customer portal',
    description:
      'Customers report seeing UTC times instead of their local timezone in the appointment view.',
    status: 'done',
    type: 'bug',
    priority: 'high',
    assignee: 'testdev',
    labels: ['bug', 'customer-portal'],
    url: 'https://jira.example.com/browse/PROJ-101',
    source: 'jira',
    ...overrides,
  };
}

function makeContext(overrides: Partial<StandupContext> = {}): StandupContext {
  return {
    branch: 'fix/PROJ-101-timezone',
    commits: [
      makeCommit(),
      makeCommit({
        hash: 'def4567890123',
        shortHash: 'def4567',
        message: 'fix: add timezone offset to appointment display',
        date: new Date('2025-01-15T14:00:00Z'),
        filesChanged: ['src/components/AppointmentCard.tsx', 'src/utils/timezone.ts'],
      }),
    ],
    pullRequests: [makePR()],
    tickets: [makeTicket()],
    diffStats: {
      filesChanged: 5,
      insertions: 120,
      deletions: 30,
    },
    topChangedFiles: [
      { path: 'src/components/AppointmentCard.tsx', frequency: 2 },
      { path: 'src/utils/timezone.ts', frequency: 2 },
      { path: 'src/tests/timezone.test.ts', frequency: 1 },
    ],
    categories: [
      { name: 'frontend', files: ['src/components/AppointmentCard.tsx'], percentage: 60 },
      { name: 'tests', files: ['src/tests/timezone.test.ts'], percentage: 20 },
      { name: 'config', files: ['tsconfig.json'], percentage: 20 },
    ],
    ticketIds: ['PROJ-101'],
    timeRange: {
      since: new Date('2025-01-15T00:00:00Z'),
      until: new Date('2025-01-15T23:59:59Z'),
      durationHours: 3.5,
    },
    repo: {
      name: 'org/repo',
      defaultBranch: 'main',
    },
    workContext: {
      branch: 'fix/PROJ-101-timezone',
      tickets: [{ id: 'PROJ-101', type: 'jira' }],
      categories: [
        { name: 'frontend', files: ['src/components/AppointmentCard.tsx'], percentage: 60 },
      ],
      commitCount: 2,
      filesChanged: ['src/components/AppointmentCard.tsx', 'src/utils/timezone.ts'],
      authors: ['Test Dev'],
      timeRange: {
        start: new Date('2025-01-15T10:30:00Z'),
        end: new Date('2025-01-15T14:00:00Z'),
        durationHours: 3.5,
      },
      summary: {
        primaryCategory: 'frontend',
        ticketSummary: 'Working on PROJ-101',
        workDescription: 'frontend work (fix)',
      },
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StandupContextBuilder', () => {
  // ── formatForPrompt ───────────────────────────────────────────────────────

  describe('formatForPrompt', () => {
    it('should include the context header and footer markers', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('=== STANDUP CONTEXT (factual data');
      expect(result).toContain('=== END CONTEXT ===');
    });

    it('should include repository and branch info', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('Repository: org/repo');
      expect(result).toContain('Branch: fix/PROJ-101-timezone');
    });

    it('should include exact commit messages with short hashes', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('[abc1234] fix: resolve timezone display issue in customer portal');
      expect(result).toContain('[def4567] fix: add timezone offset to appointment display');
    });

    it('should include commit count in section header', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- GIT COMMITS (2 total) ---');
    });

    it('should include commit file changes when available', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('src/components/AppointmentCard.tsx');
      expect(result).toContain('src/utils/timezone.ts');
    });

    it('should include commit body when present', () => {
      const ctx = makeContext({
        commits: [
          makeCommit({
            body: 'This fixes the UTC display issue by converting timestamps to local time.',
          }),
        ],
      });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('Body: This fixes the UTC display issue');
    });

    it('should include PR details with title, state, and description', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- PULL REQUESTS (1) ---');
      expect(result).toContain('PR #42: Fix timezone display in customer portal (merged)');
      expect(result).toContain('Branch: fix/PROJ-101-timezone');
      expect(result).toContain('Linked tickets: PROJ-101');
    });

    it('should include PR labels when present', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('[bug, customer-facing]');
    });

    it('should include PR body preview', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('Description: This PR fixes the timezone rendering issue');
    });

    it('should include ticket details with type and status', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- TICKETS/ISSUES (1) ---');
      expect(result).toContain('PROJ-101: Timezone display incorrect in customer portal');
      expect(result).toContain('Type: bug | Status: done | Priority: high');
    });

    it('should include ticket description', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('Customers report seeing UTC times');
    });

    it('should include diff statistics', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- DIFF STATISTICS ---');
      expect(result).toContain('Files changed: 5');
      expect(result).toContain('Lines added: +120');
      expect(result).toContain('Lines removed: -30');
    });

    it('should include top changed files', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- TOP CHANGED FILES ---');
      expect(result).toContain('src/components/AppointmentCard.tsx (2 commits)');
    });

    it('should include work categories', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- WORK AREAS ---');
      expect(result).toContain('frontend: 60%');
      expect(result).toContain('tests: 20%');
    });

    it('should handle context with no PRs', () => {
      const ctx = makeContext({ pullRequests: [] });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).not.toContain('--- PULL REQUESTS');
      expect(result).toContain('--- GIT COMMITS');
    });

    it('should handle context with no tickets but with ticket IDs', () => {
      const ctx = makeContext({ tickets: [], ticketIds: ['PROJ-101', 'PROJ-102'] });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).not.toContain('--- TICKETS/ISSUES');
      expect(result).toContain('--- TICKET REFERENCES (not fetched) ---');
      expect(result).toContain('PROJ-101, PROJ-102');
    });

    it('should handle context with no tickets and no ticket IDs', () => {
      const ctx = makeContext({ tickets: [], ticketIds: [] });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).not.toContain('--- TICKETS/ISSUES');
      expect(result).not.toContain('--- TICKET REFERENCES');
    });

    it('should handle context with no diff stats', () => {
      const ctx = makeContext({ diffStats: null });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).not.toContain('--- DIFF STATISTICS');
    });

    it('should handle context with no commits', () => {
      const ctx = makeContext({ commits: [] });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- GIT COMMITS (0 total) ---');
      expect(result).toContain('(no commits in this period)');
    });

    it('should handle context with no repo name', () => {
      const ctx = makeContext({ repo: { name: null, defaultBranch: 'main' } });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).not.toContain('Repository:');
      expect(result).toContain('Branch:');
    });

    it('should handle multiple PRs', () => {
      const ctx = makeContext({
        pullRequests: [
          makePR({ number: 42, title: 'Fix timezone' }),
          makePR({
            number: 43,
            title: 'Add invoice sync',
            state: 'open',
            linkedTickets: ['PROJ-102'],
          }),
        ],
      });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('--- PULL REQUESTS (2) ---');
      expect(result).toContain('PR #42: Fix timezone');
      expect(result).toContain('PR #43: Add invoice sync (open)');
    });

    it('should truncate long PR body', () => {
      const longBody = 'A'.repeat(1500);
      const ctx = makeContext({
        pullRequests: [makePR({ body: longBody })],
      });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      // PR body is capped at 1000 in parsePR, then 300 in formatForPrompt
      expect(result).toContain('Description:');
      // Should not contain the full 1500-char body
      const descLine = result.split('\n').find((l) => l.includes('Description:'));
      expect(descLine).toBeDefined();
      // The description should be much shorter than 1500 chars
      expect(descLine!.length).toBeLessThan(400);
    });

    it('should truncate long commit body', () => {
      const longBody = 'B'.repeat(500);
      const ctx = makeContext({
        commits: [makeCommit({ body: longBody })],
      });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      // Body is trimmed to 300 chars in formatForPrompt
      const bodyLine = result.split('\n').find((l) => l.includes('Body:'));
      expect(bodyLine).toBeDefined();
      expect(bodyLine!.length).toBeLessThan(400);
    });

    it('should limit file list per commit to 5 with overflow indicator', () => {
      const manyFiles = Array.from({ length: 8 }, (_, i) => `src/file${i}.ts`);
      const ctx = makeContext({
        commits: [makeCommit({ filesChanged: manyFiles })],
      });
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('(+3 more)');
    });

    it('should include ticket URL when present', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatForPrompt(ctx);

      expect(result).toContain('URL: https://jira.example.com/browse/PROJ-101');
    });
  });

  // ── formatDebugSummary ────────────────────────────────────────────────────

  describe('formatDebugSummary', () => {
    it('should include debug header', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('STANDUP CONTEXT (debug)');
    });

    it('should include repo and branch info', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Repo:     org/repo');
      expect(result).toContain('Branch:   fix/PROJ-101-timezone');
    });

    it('should include commit count and summary', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Commits:  2');
      expect(result).toContain('[abc1234]');
      expect(result).toContain('[def4567]');
    });

    it('should include PR count and summary', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('PRs:      1');
      expect(result).toContain('#42');
    });

    it('should include ticket count and details', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Tickets:  1 fetched, 1 IDs found');
      expect(result).toContain('PROJ-101');
    });

    it('should show unfetched ticket IDs', () => {
      const ctx = makeContext({
        tickets: [],
        ticketIds: ['PROJ-101', 'PROJ-102'],
      });
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Tickets:  0 fetched, 2 IDs found');
      expect(result).toContain('(unfetched: PROJ-101, PROJ-102)');
    });

    it('should include diff stats when available', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Diff:     5 files, +120/-30');
    });

    it('should show "(not available)" when diff stats are null', () => {
      const ctx = makeContext({ diffStats: null });
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Diff:     (not available)');
    });

    it('should include work area categories', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Areas:');
      expect(result).toContain('frontend(60%)');
    });

    it('should include top files', () => {
      const ctx = makeContext();
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Top files:');
      expect(result).toContain('src/components/AppointmentCard.tsx');
    });

    it('should limit commits shown to 10 with overflow', () => {
      const manyCommits = Array.from({ length: 15 }, (_, i) =>
        makeCommit({
          hash: `hash${i}`.padEnd(13, '0'),
          shortHash: `hash${i}`.slice(0, 7),
          message: `commit ${i}`,
        })
      );
      const ctx = makeContext({ commits: manyCommits });
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Commits:  15');
      expect(result).toContain('... and 5 more');
    });

    it('should handle empty context gracefully', () => {
      const ctx = makeContext({
        commits: [],
        pullRequests: [],
        tickets: [],
        ticketIds: [],
        diffStats: null,
        topChangedFiles: [],
        categories: [],
      });
      const result = StandupContextBuilder.formatDebugSummary(ctx);

      expect(result).toContain('Commits:  0');
      expect(result).toContain('PRs:      0');
      expect(result).toContain('Tickets:  0 fetched, 0 IDs found');
    });
  });

  // ── buildStandupPrompt ────────────────────────────────────────────────────

  describe('buildStandupPrompt', () => {
    it('should include critical rules about accuracy', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('CRITICAL RULES');
      expect(prompt).toContain('ONLY describe work that appears in the context data');
      expect(prompt).toContain('Do NOT invent or embellish');
    });

    it('should include the full context block', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      // Should embed the formatted context
      expect(prompt).toContain('=== STANDUP CONTEXT');
      expect(prompt).toContain('=== END CONTEXT ===');
      expect(prompt).toContain('PROJ-101');
      expect(prompt).toContain('PR #42');
    });

    it('should include the output format template', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('**Yesterday/Recently:**');
      expect(prompt).toContain('**Today/Next:**');
      expect(prompt).toContain('**Blockers:**');
    });

    it('should use engineering tone when specified', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx, 'engineering');

      expect(prompt).toContain('precise technical language');
      expect(prompt).toContain('engineering audience');
    });

    it('should use mixed tone by default', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('both technical and non-technical');
      expect(prompt).toContain('Do NOT invent impacts');
    });

    it('should use business tone when specified', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx, 'business');

      expect(prompt).toContain('features, fixes, and improvements');
      expect(prompt).toContain('Do NOT fabricate user-facing benefits');
    });

    it('should instruct to group related commits', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('Group related commits');
    });

    it('should instruct to prefer PR titles over individual commits', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('prefer the PR title');
    });

    it('should instruct no emoji', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('Do NOT add emoji');
    });

    it('should instruct word limit', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('under 300 words');
    });
  });

  // ── buildWeeklyPrompt ─────────────────────────────────────────────────────

  describe('buildWeeklyPrompt', () => {
    it('should include critical rules about accuracy', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildWeeklyPrompt(ctx);

      expect(prompt).toContain('CRITICAL RULES');
      expect(prompt).toContain('ONLY describe work that appears in the context data');
    });

    it('should include the full context block', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildWeeklyPrompt(ctx);

      expect(prompt).toContain('=== STANDUP CONTEXT');
      expect(prompt).toContain('=== END CONTEXT ===');
    });

    it('should include weekly format template', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildWeeklyPrompt(ctx);

      expect(prompt).toContain('**Key Accomplishments:**');
      expect(prompt).toContain('**Stats:**');
      expect(prompt).toContain('**Top Achievement:**');
    });

    it('should instruct to group into themes', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildWeeklyPrompt(ctx);

      expect(prompt).toContain('Group related work into themes');
    });

    it('should instruct word limit', () => {
      const ctx = makeContext();
      const prompt = StandupContextBuilder.buildWeeklyPrompt(ctx);

      expect(prompt).toContain('Under 200 words');
    });
  });

  // ── Edge cases & data integrity ───────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle a minimal context with only one commit', () => {
      const ctx = makeContext({
        commits: [makeCommit()],
        pullRequests: [],
        tickets: [],
        ticketIds: [],
        diffStats: null,
        topChangedFiles: [],
        categories: [],
      });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('[abc1234]');
      expect(formatted).toContain('--- GIT COMMITS (1 total) ---');

      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);
      expect(prompt).toContain('CRITICAL RULES');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should handle a context with many PRs', () => {
      const prs = Array.from({ length: 10 }, (_, i) =>
        makePR({
          number: i + 1,
          title: `PR title ${i + 1}`,
          linkedTickets: [`PROJ-${i + 1}`],
        })
      );
      const ctx = makeContext({ pullRequests: prs });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('--- PULL REQUESTS (10) ---');
      expect(formatted).toContain('PR #1: PR title 1');
      expect(formatted).toContain('PR #10: PR title 10');
    });

    it('should handle a context with many tickets', () => {
      const tickets = Array.from({ length: 5 }, (_, i) =>
        makeTicket({
          id: `PROJ-${100 + i}`,
          title: `Ticket ${100 + i}`,
          type: i % 2 === 0 ? 'bug' : 'feature',
        })
      );
      const ctx = makeContext({ tickets, ticketIds: tickets.map((t) => t.id) });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('--- TICKETS/ISSUES (5) ---');
      expect(formatted).toContain('PROJ-100');
      expect(formatted).toContain('PROJ-104');
    });

    it('should handle commits without body or files', () => {
      const ctx = makeContext({
        commits: [makeCommit({ body: undefined, filesChanged: undefined })],
      });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).not.toContain('Body:');
      expect(formatted).not.toContain('Files:');
      expect(formatted).toContain('[abc1234]');
    });

    it('should handle PR without body', () => {
      const ctx = makeContext({
        pullRequests: [makePR({ body: '' })],
        tickets: [],
        ticketIds: [],
      });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('PR #42');
      expect(formatted).not.toContain('Description:');
    });

    it('should handle ticket without description', () => {
      const ctx = makeContext({
        pullRequests: [],
        tickets: [makeTicket({ description: '' })],
      });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('PROJ-101');
      // Empty description should not produce a Description: line for the ticket
      const lines = formatted.split('\n');
      const descLines = lines.filter((l) => l.trim().startsWith('Description:'));
      expect(descLines.length).toBe(0);
    });

    it('should handle ticket without priority', () => {
      const ctx = makeContext({
        tickets: [makeTicket({ priority: undefined })],
      });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('Type: bug | Status: done');
      expect(formatted).not.toContain('Priority:');
    });

    it('should include PR URL', () => {
      const ctx = makeContext();
      const formatted = StandupContextBuilder.formatForPrompt(ctx);

      expect(formatted).toContain('URL: https://github.com/org/repo/pull/42');
    });

    it('should handle topChangedFiles with frequency 1 (no annotation)', () => {
      const ctx = makeContext({
        topChangedFiles: [{ path: 'single-touch.ts', frequency: 1 }],
      });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('single-touch.ts');
      expect(formatted).not.toContain('single-touch.ts (1 commits)');
    });

    it('should limit top changed files to 10 in formatted output', () => {
      const files: FileChange[] = Array.from({ length: 20 }, (_, i) => ({
        path: `src/file${i}.ts`,
        frequency: 20 - i,
      }));
      const ctx = makeContext({ topChangedFiles: files });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('src/file0.ts');
      expect(formatted).toContain('src/file9.ts');
      expect(formatted).not.toContain('src/file10.ts');
    });

    it('should limit categories to 5 in formatted output', () => {
      const categories: WorkCategory[] = Array.from({ length: 8 }, (_, i) => ({
        name: `category${i}`,
        files: [`file${i}.ts`],
        percentage: Math.floor(100 / 8),
      }));
      const ctx = makeContext({ categories });

      const formatted = StandupContextBuilder.formatForPrompt(ctx);
      expect(formatted).toContain('category0');
      expect(formatted).toContain('category4');
      expect(formatted).not.toContain('category5');
    });
  });

  // ── Prompt content correctness ────────────────────────────────────────────

  describe('prompt content correctness', () => {
    it('should embed all commit messages in the prompt', () => {
      const ctx = makeContext({
        commits: [
          makeCommit({ message: 'fix: timezone offset in appointment view' }),
          makeCommit({
            shortHash: 'bbb1234',
            message: 'feat: add Xero invoice integration',
          }),
          makeCommit({
            shortHash: 'ccc1234',
            message: 'chore: update file upload size limits',
          }),
        ],
      });

      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('fix: timezone offset in appointment view');
      expect(prompt).toContain('feat: add Xero invoice integration');
      expect(prompt).toContain('chore: update file upload size limits');
    });

    it('should embed all ticket details in the prompt', () => {
      const ctx = makeContext({
        tickets: [
          makeTicket({ id: 'PROJ-101', title: 'Fix timezone' }),
          makeTicket({
            id: 'PROJ-102',
            title: 'Invoice sync',
            type: 'feature',
            status: 'in-progress',
          }),
        ],
      });

      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('PROJ-101: Fix timezone');
      expect(prompt).toContain('PROJ-102: Invoice sync');
      expect(prompt).toContain('Status: in-progress');
    });

    it('should embed all PR titles in the prompt', () => {
      const ctx = makeContext({
        pullRequests: [
          makePR({ number: 10, title: 'Fix timezone rendering' }),
          makePR({ number: 11, title: 'Add Xero invoice sync', state: 'open' }),
        ],
      });

      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('PR #10: Fix timezone rendering');
      expect(prompt).toContain('PR #11: Add Xero invoice sync (open)');
    });

    it('should embed diff stats in the prompt', () => {
      const ctx = makeContext({
        diffStats: { filesChanged: 12, insertions: 450, deletions: 80 },
      });

      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).toContain('Files changed: 12');
      expect(prompt).toContain('Lines added: +450');
      expect(prompt).toContain('Lines removed: -80');
    });

    it('should not include diff stats section when null', () => {
      const ctx = makeContext({ diffStats: null });

      const prompt = StandupContextBuilder.buildStandupPrompt(ctx);

      expect(prompt).not.toContain('DIFF STATISTICS');
    });
  });

  // ── Consistency between formatForPrompt and buildStandupPrompt ────────────

  describe('consistency', () => {
    it('buildStandupPrompt should contain the full output of formatForPrompt', () => {
      const ctx = makeContext();
      const contextBlock = StandupContextBuilder.formatForPrompt(ctx);
      const fullPrompt = StandupContextBuilder.buildStandupPrompt(ctx);

      // The prompt should embed the entire context block
      expect(fullPrompt).toContain(contextBlock);
    });

    it('buildWeeklyPrompt should contain the full output of formatForPrompt', () => {
      const ctx = makeContext();
      const contextBlock = StandupContextBuilder.formatForPrompt(ctx);
      const fullPrompt = StandupContextBuilder.buildWeeklyPrompt(ctx);

      expect(fullPrompt).toContain(contextBlock);
    });
  });
});
