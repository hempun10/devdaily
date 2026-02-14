/**
 * Work Journal & Snapshot Builder Tests
 *
 * Tests for the persistent work journal storage layer and the snapshot builder
 * that captures project state into journal entries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  WorkJournal,
  type WorkSnapshot,
  type JournalCommit,
  type JournalBranchSnapshot,
  type JournalPRSnapshot,
  type JournalTicketSnapshot,
} from '../src/core/work-journal.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `devdaily-journal-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function makeCommit(overrides: Partial<JournalCommit> = {}): JournalCommit {
  const hash = overrides.hash || Math.random().toString(16).slice(2, 42).padEnd(40, '0');
  return {
    hash,
    shortHash: overrides.shortHash || hash.slice(0, 7),
    message: overrides.message || 'test commit message',
    author: overrides.author || 'Test User',
    date: overrides.date || new Date().toISOString(),
    filesChanged: overrides.filesChanged || ['src/index.ts'],
  };
}

function makeBranch(overrides: Partial<JournalBranchSnapshot> = {}): JournalBranchSnapshot {
  return {
    name: overrides.name || 'feature/test-branch',
    lastCommitHash: overrides.lastCommitHash || 'abc1234',
    lastCommitMessage: overrides.lastCommitMessage || 'last commit on branch',
    lastCommitDate: overrides.lastCommitDate || new Date().toISOString(),
    hasUncommittedChanges: overrides.hasUncommittedChanges ?? false,
    aheadOfBase: overrides.aheadOfBase ?? 3,
    uncommittedFiles: overrides.uncommittedFiles || [],
  };
}

function makePR(overrides: Partial<JournalPRSnapshot> = {}): JournalPRSnapshot {
  return {
    number: overrides.number || 42,
    title: overrides.title || 'Add auth feature',
    state: overrides.state || 'open',
    url: overrides.url || 'https://github.com/test/repo/pull/42',
    baseBranch: overrides.baseBranch || 'main',
    headBranch: overrides.headBranch || 'feature/auth',
    labels: overrides.labels || ['enhancement'],
  };
}

function _makeTicket(overrides: Partial<JournalTicketSnapshot> = {}): JournalTicketSnapshot {
  return {
    id: overrides.id || 'PROJ-123',
    title: overrides.title || 'Implement login flow',
    status: overrides.status || 'in-progress',
    type: overrides.type || 'story',
    priority: overrides.priority,
    url: overrides.url,
  };
}

function makeSnapshot(overrides: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    date: overrides.date || '2024-06-15',
    takenAt: overrides.takenAt || new Date().toISOString(),
    projectId: overrides.projectId || 'test-project',
    repoPath: overrides.repoPath || '/home/user/projects/test-project',
    remoteUrl: overrides.remoteUrl,
    currentBranch: overrides.currentBranch || 'feature/auth',
    activeBranches: overrides.activeBranches || [makeBranch({ name: 'feature/auth' })],
    todayCommits: overrides.todayCommits || [makeCommit()],
    recentCommits: overrides.recentCommits || [makeCommit()],
    pullRequests: overrides.pullRequests || [],
    tickets: overrides.tickets || [],
    categories: overrides.categories || [{ name: 'frontend', percentage: 60 }],
    topChangedFiles: overrides.topChangedFiles || [{ path: 'src/index.ts', frequency: 3 }],
    diffStats:
      'diffStats' in overrides
        ? overrides.diffStats!
        : { filesChanged: 5, insertions: 120, deletions: 30 },
    notes: overrides.notes,
    aiSummary: overrides.aiSummary,
    tags: overrides.tags || [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkJournal', () => {
  let testDir: string;
  let journal: WorkJournal;

  beforeEach(() => {
    testDir = createTestDir();
    journal = new WorkJournal(testDir);
  });

  afterEach(() => {
    cleanupDir(testDir);
  });

  // ─── Constructor & Initialization ─────────────────────────────────────

  describe('constructor', () => {
    it('creates the journal directory if it does not exist', () => {
      const newDir = join(testDir, 'subdir', 'journal');
      const _j = new WorkJournal(newDir);
      expect(existsSync(newDir)).toBe(true);
    });

    it('works with an existing directory', () => {
      // testDir already exists
      const _j = new WorkJournal(testDir);
      expect(existsSync(testDir)).toBe(true);
    });
  });

  // ─── saveSnapshot ─────────────────────────────────────────────────────

  describe('saveSnapshot', () => {
    it('saves a snapshot to the correct date directory', () => {
      const snapshot = makeSnapshot({ date: '2024-06-15' });
      journal.saveSnapshot(snapshot);

      const filePath = join(testDir, '2024-06-15', 'test-project.json');
      expect(existsSync(filePath)).toBe(true);

      const saved = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(saved.projectId).toBe('test-project');
      expect(saved.date).toBe('2024-06-15');
    });

    it('creates the date directory if it does not exist', () => {
      const snapshot = makeSnapshot({ date: '2024-12-25' });
      journal.saveSnapshot(snapshot);

      const dateDir = join(testDir, '2024-12-25');
      expect(existsSync(dateDir)).toBe(true);
    });

    it('merges with an existing snapshot for the same date+project', () => {
      const commit1 = makeCommit({ hash: 'aaaa'.repeat(10), message: 'first commit' });
      const commit2 = makeCommit({ hash: 'bbbb'.repeat(10), message: 'second commit' });

      const snap1 = makeSnapshot({
        date: '2024-06-15',
        todayCommits: [commit1],
        tags: ['feat'],
      });
      journal.saveSnapshot(snap1);

      const snap2 = makeSnapshot({
        date: '2024-06-15',
        todayCommits: [commit2],
        tags: ['fix'],
      });
      journal.saveSnapshot(snap2);

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved).not.toBeNull();
      // Both commits should be present (merged)
      expect(saved!.todayCommits.length).toBe(2);
      // Tags should be merged
      expect(saved!.tags).toContain('feat');
      expect(saved!.tags).toContain('fix');
    });

    it('deduplicates commits by hash during merge', () => {
      const commit = makeCommit({ hash: 'dddd'.repeat(10), message: 'same commit' });

      const snap1 = makeSnapshot({ date: '2024-06-15', todayCommits: [commit] });
      journal.saveSnapshot(snap1);

      const snap2 = makeSnapshot({ date: '2024-06-15', todayCommits: [commit] });
      journal.saveSnapshot(snap2);

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.todayCommits.length).toBe(1);
    });

    it('merges notes from existing and incoming snapshots', () => {
      const snap1 = makeSnapshot({ date: '2024-06-15', notes: 'First note' });
      journal.saveSnapshot(snap1);

      const snap2 = makeSnapshot({ date: '2024-06-15', notes: 'Second note' });
      journal.saveSnapshot(snap2);

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.notes).toContain('First note');
      expect(saved!.notes).toContain('Second note');
    });

    it('preserves AI summary from existing if incoming has none', () => {
      const snap1 = makeSnapshot({ date: '2024-06-15', aiSummary: 'AI generated summary' });
      journal.saveSnapshot(snap1);

      const snap2 = makeSnapshot({ date: '2024-06-15', aiSummary: undefined });
      journal.saveSnapshot(snap2);

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.aiSummary).toBe('AI generated summary');
    });

    it('updates AI summary when incoming has one', () => {
      const snap1 = makeSnapshot({ date: '2024-06-15', aiSummary: 'Old summary' });
      journal.saveSnapshot(snap1);

      const snap2 = makeSnapshot({ date: '2024-06-15', aiSummary: 'New summary' });
      journal.saveSnapshot(snap2);

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.aiSummary).toBe('New summary');
    });

    it('updates the index after saving', () => {
      const snapshot = makeSnapshot({ date: '2024-06-15' });
      journal.saveSnapshot(snapshot);

      const indexPath = join(testDir, 'index.json');
      expect(existsSync(indexPath)).toBe(true);

      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      expect(index.projects.length).toBe(1);
      expect(index.projects[0].projectId).toBe('test-project');
      expect(index.projects[0].lastSnapshotDate).toBe('2024-06-15');
    });

    it('handles multiple projects on the same date', () => {
      const snap1 = makeSnapshot({ date: '2024-06-15', projectId: 'project-a' });
      const snap2 = makeSnapshot({ date: '2024-06-15', projectId: 'project-b' });

      journal.saveSnapshot(snap1);
      journal.saveSnapshot(snap2);

      const snapshots = journal.getSnapshotsForDate('2024-06-15');
      expect(snapshots.length).toBe(2);
      const projectIds = snapshots.map((s) => s.projectId).sort();
      expect(projectIds).toEqual(['project-a', 'project-b']);
    });
  });

  // ─── getSnapshot ──────────────────────────────────────────────────────

  describe('getSnapshot', () => {
    it('returns null for a non-existent snapshot', () => {
      expect(journal.getSnapshot('2024-01-01', 'nonexistent')).toBeNull();
    });

    it('returns the snapshot when it exists', () => {
      const snapshot = makeSnapshot({ date: '2024-06-15' });
      journal.saveSnapshot(snapshot);

      const result = journal.getSnapshot('2024-06-15', 'test-project');
      expect(result).not.toBeNull();
      expect(result!.projectId).toBe('test-project');
      expect(result!.currentBranch).toBe('feature/auth');
    });

    it('returns null for corrupted JSON files', () => {
      const dateDir = join(testDir, '2024-06-15');
      mkdirSync(dateDir, { recursive: true });
      writeFileSync(join(dateDir, 'test-project.json'), 'NOT VALID JSON', 'utf-8');

      expect(journal.getSnapshot('2024-06-15', 'test-project')).toBeNull();
    });
  });

  // ─── getSnapshotsForDate ──────────────────────────────────────────────

  describe('getSnapshotsForDate', () => {
    it('returns empty array for date with no snapshots', () => {
      expect(journal.getSnapshotsForDate('2024-01-01')).toEqual([]);
    });

    it('returns all snapshots for a given date', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'a' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'b' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'c' }));

      const results = journal.getSnapshotsForDate('2024-06-15');
      expect(results.length).toBe(3);
    });

    it('skips corrupted files', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'good' }));
      // Write a corrupted file
      writeFileSync(join(testDir, '2024-06-15', 'bad.json'), '{{broken', 'utf-8');

      const results = journal.getSnapshotsForDate('2024-06-15');
      expect(results.length).toBe(1);
      expect(results[0].projectId).toBe('good');
    });
  });

  // ─── getSnapshotsForRange ─────────────────────────────────────────────

  describe('getSnapshotsForRange', () => {
    beforeEach(() => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-10', projectId: 'proj' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-12', projectId: 'proj' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-14', projectId: 'proj' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-14', projectId: 'other' }));
    });

    it('returns snapshots within the date range (inclusive)', () => {
      const results = journal.getSnapshotsForRange('proj', '2024-06-10', '2024-06-14');
      expect(results.length).toBe(3);
    });

    it('filters by project ID', () => {
      const results = journal.getSnapshotsForRange('proj', '2024-06-14', '2024-06-14');
      expect(results.length).toBe(1);
      expect(results[0].projectId).toBe('proj');
    });

    it('returns all projects when projectId is null', () => {
      const results = journal.getSnapshotsForRange(null, '2024-06-14', '2024-06-14');
      expect(results.length).toBe(2);
    });

    it('returns empty array for range with no data', () => {
      const results = journal.getSnapshotsForRange('proj', '2025-01-01', '2025-01-07');
      expect(results.length).toBe(0);
    });

    it('results are sorted chronologically', () => {
      const results = journal.getSnapshotsForRange('proj', '2024-06-10', '2024-06-14');
      const dates = results.map((s) => s.date);
      expect(dates).toEqual(['2024-06-10', '2024-06-12', '2024-06-14']);
    });

    it('handles partial range overlap', () => {
      const results = journal.getSnapshotsForRange('proj', '2024-06-11', '2024-06-13');
      expect(results.length).toBe(1);
      expect(results[0].date).toBe('2024-06-12');
    });
  });

  // ─── getLatestSnapshot ────────────────────────────────────────────────

  describe('getLatestSnapshot', () => {
    it('returns null for unknown project', () => {
      expect(journal.getLatestSnapshot('nonexistent')).toBeNull();
    });

    it('returns the most recent snapshot for a project', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-10', projectId: 'proj' }));
      journal.saveSnapshot(
        makeSnapshot({ date: '2024-06-15', projectId: 'proj', currentBranch: 'latest-branch' })
      );

      const latest = journal.getLatestSnapshot('proj');
      expect(latest).not.toBeNull();
      expect(latest!.date).toBe('2024-06-15');
      expect(latest!.currentBranch).toBe('latest-branch');
    });
  });

  // ─── getRecentActivity ────────────────────────────────────────────────

  describe('getRecentActivity', () => {
    it('returns empty array when no snapshots exist', () => {
      expect(journal.getRecentActivity(7)).toEqual([]);
    });

    it('returns snapshots from the last N days', () => {
      const today = journal.todayString();
      const yesterday = journal.dateToString(new Date(Date.now() - 86400000));

      journal.saveSnapshot(makeSnapshot({ date: today, projectId: 'proj' }));
      journal.saveSnapshot(makeSnapshot({ date: yesterday, projectId: 'proj' }));

      const results = journal.getRecentActivity(2);
      expect(results.length).toBe(2);
    });
  });

  // ─── addNote ──────────────────────────────────────────────────────────

  describe('addNote', () => {
    it('adds a note to an existing snapshot', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15' }));
      journal.addNote('test-project', 'Remember to fix the auth bug', '2024-06-15');

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.notes).toContain('Remember to fix the auth bug');
    });

    it('creates a minimal snapshot if none exists for the note', () => {
      journal.addNote('new-project', 'Starting new project today', '2024-06-15');

      const snap = journal.getSnapshot('2024-06-15', 'new-project');
      expect(snap).not.toBeNull();
      expect(snap!.notes).toBe('Starting new project today');
      expect(snap!.todayCommits).toEqual([]);
    });

    it('appends to existing notes', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', notes: 'First note' }));
      journal.addNote('test-project', 'Second note', '2024-06-15');

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.notes).toContain('First note');
      expect(snap!.notes).toContain('Second note');
    });
  });

  // ─── setAISummary ─────────────────────────────────────────────────────

  describe('setAISummary', () => {
    it('sets an AI summary on an existing snapshot', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15' }));
      journal.setAISummary('test-project', 'AI says: you worked on auth', '2024-06-15');

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.aiSummary).toBe('AI says: you worked on auth');
    });

    it('does nothing if no snapshot exists', () => {
      journal.setAISummary('nonexistent', 'summary', '2024-06-15');
      expect(journal.getSnapshot('2024-06-15', 'nonexistent')).toBeNull();
    });
  });

  // ─── addTags ──────────────────────────────────────────────────────────

  describe('addTags', () => {
    it('adds tags to an existing snapshot', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', tags: ['existing'] }));
      journal.addTags('test-project', ['new-tag', 'another'], '2024-06-15');

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.tags).toContain('existing');
      expect(snap!.tags).toContain('new-tag');
      expect(snap!.tags).toContain('another');
    });

    it('deduplicates tags', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', tags: ['dup'] }));
      journal.addTags('test-project', ['dup', 'unique'], '2024-06-15');

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      const dupCount = snap!.tags.filter((t) => t === 'dup').length;
      expect(dupCount).toBe(1);
      expect(snap!.tags).toContain('unique');
    });
  });

  // ─── getProjects ──────────────────────────────────────────────────────

  describe('getProjects', () => {
    it('returns empty array when no snapshots saved', () => {
      expect(journal.getProjects()).toEqual([]);
    });

    it('returns all tracked projects', () => {
      journal.saveSnapshot(makeSnapshot({ projectId: 'alpha', date: '2024-06-15' }));
      journal.saveSnapshot(makeSnapshot({ projectId: 'beta', date: '2024-06-15' }));

      const projects = journal.getProjects();
      expect(projects.length).toBe(2);
      const ids = projects.map((p) => p.projectId).sort();
      expect(ids).toEqual(['alpha', 'beta']);
    });

    it('tracks snapshot count per project', () => {
      journal.saveSnapshot(makeSnapshot({ projectId: 'proj', date: '2024-06-10' }));
      journal.saveSnapshot(makeSnapshot({ projectId: 'proj', date: '2024-06-11' }));
      journal.saveSnapshot(makeSnapshot({ projectId: 'proj', date: '2024-06-12' }));

      const projects = journal.getProjects();
      const proj = projects.find((p) => p.projectId === 'proj');
      expect(proj).toBeDefined();
      expect(proj!.snapshotCount).toBe(3);
      expect(proj!.lastSnapshotDate).toBe('2024-06-12');
      expect(proj!.firstSeen).toBe('2024-06-10');
    });
  });

  // ─── hasTodaySnapshot ─────────────────────────────────────────────────

  describe('hasTodaySnapshot', () => {
    it('returns false when no snapshot exists for today', () => {
      expect(journal.hasTodaySnapshot('test-project')).toBe(false);
    });

    it('returns true when a snapshot exists for today', () => {
      const today = journal.todayString();
      journal.saveSnapshot(makeSnapshot({ date: today }));
      expect(journal.hasTodaySnapshot('test-project')).toBe(true);
    });
  });

  // ─── search ───────────────────────────────────────────────────────────

  describe('search', () => {
    beforeEach(() => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-10',
          projectId: 'frontend-app',
          currentBranch: 'feature/login-page',
          todayCommits: [
            makeCommit({
              message: 'feat: add login form component',
              filesChanged: ['src/components/LoginForm.tsx'],
            }),
            makeCommit({
              message: 'fix: login validation error',
              filesChanged: ['src/utils/validation.ts'],
            }),
          ],
          pullRequests: [makePR({ number: 10, title: 'Add login page' })],
          tags: ['feat', 'frontend', 'login'],
          notes: 'Working on the authentication flow',
        })
      );

      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-12',
          projectId: 'backend-api',
          currentBranch: 'feature/auth-api',
          todayCommits: [
            makeCommit({
              message: 'feat: add JWT auth middleware',
              filesChanged: ['src/middleware/auth.ts'],
            }),
          ],
          tags: ['feat', 'backend', 'auth'],
        })
      );

      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-14',
          projectId: 'frontend-app',
          currentBranch: 'fix/css-layout',
          todayCommits: [
            makeCommit({
              message: 'fix: responsive layout on dashboard',
              filesChanged: ['src/styles/dashboard.css'],
            }),
          ],
          tags: ['fix', 'frontend', 'css'],
          notes: 'CSS cleanup sprint',
        })
      );
    });

    it('matches by branch name', () => {
      const results = journal.search({ query: 'login' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].snapshot.currentBranch).toContain('login');
    });

    it('matches by commit message', () => {
      const results = journal.search({ query: 'JWT' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].snapshot.projectId).toBe('backend-api');
    });

    it('matches by file path in commits', () => {
      const results = journal.search({ query: 'LoginForm' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].snapshot.date).toBe('2024-06-10');
    });

    it('matches by PR title', () => {
      const results = journal.search({ query: 'login page' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      const reasons = results[0].matchReasons;
      expect(reasons.some((r) => r.includes('PR'))).toBe(true);
    });

    it('matches by notes', () => {
      const results = journal.search({ query: 'authentication flow' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].matchReasons).toContain('notes');
    });

    it('matches by tags', () => {
      const results = journal.search({ tags: ['backend'] });
      expect(results.length).toBe(1);
      expect(results[0].snapshot.projectId).toBe('backend-api');
    });

    it('matches by project ID', () => {
      const results = journal.search({ query: 'backend-api' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].snapshot.projectId).toBe('backend-api');
    });

    it('filters by date range', () => {
      const results = journal.search({
        query: 'feat',
        from: '2024-06-11',
        to: '2024-06-13',
      });
      // Only the 2024-06-12 snapshot should match
      expect(results.length).toBe(1);
      expect(results[0].snapshot.date).toBe('2024-06-12');
    });

    it('filters by project ID', () => {
      const results = journal.search({
        query: 'feat',
        projectId: 'frontend-app',
      });
      expect(results.every((r) => r.snapshot.projectId === 'frontend-app')).toBe(true);
    });

    it('respects the limit parameter', () => {
      const results = journal.search({ query: 'fe', limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('sorts by score descending', () => {
      const results = journal.search({ query: 'login' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });

    it('returns all snapshots in range when no query or tags', () => {
      const results = journal.search({
        from: '2024-06-10',
        to: '2024-06-14',
      });
      expect(results.length).toBe(3);
    });

    it('returns empty array when no matches', () => {
      const results = journal.search({ query: 'xyznonexistent' });
      expect(results).toEqual([]);
    });

    it('is case-insensitive', () => {
      const results = journal.search({ query: 'jwt' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('provides meaningful match reasons', () => {
      const results = journal.search({ query: 'login' });
      expect(results[0].matchReasons.length).toBeGreaterThan(0);
      // Should have reasons for branch, commit, and PR matches
      const allReasons = results[0].matchReasons.join(' ');
      expect(allReasons).toBeTruthy();
    });

    it('matches top changed files', () => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-16',
          projectId: 'proj',
          topChangedFiles: [{ path: 'src/api/users.ts', frequency: 5 }],
          todayCommits: [],
        })
      );

      const results = journal.search({ query: 'users.ts' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.matchReasons.some((m) => m.includes('changed file')))).toBe(
        true
      );
    });
  });

  // ─── findFileHistory ──────────────────────────────────────────────────

  describe('findFileHistory', () => {
    beforeEach(() => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-10',
          todayCommits: [
            makeCommit({ message: 'initial auth', filesChanged: ['src/auth.ts', 'src/utils.ts'] }),
          ],
        })
      );
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-12',
          todayCommits: [makeCommit({ message: 'refactor auth', filesChanged: ['src/auth.ts'] })],
        })
      );
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-14',
          todayCommits: [
            makeCommit({ message: 'add dashboard', filesChanged: ['src/dashboard.ts'] }),
          ],
        })
      );
    });

    it('finds all dates where a file was changed', () => {
      const results = journal.findFileHistory('auth.ts', undefined, 365 * 5);
      expect(results.length).toBe(2);
    });

    it('returns commits that touched the file', () => {
      const results = journal.findFileHistory('auth.ts', undefined, 365 * 5);
      expect(results[0].commits.length).toBeGreaterThan(0);
      expect(results[0].commits[0].message).toContain('auth');
    });

    it('is case-insensitive', () => {
      const results = journal.findFileHistory('AUTH.TS', undefined, 365 * 5);
      expect(results.length).toBe(2);
    });

    it('supports partial path matching', () => {
      const results = journal.findFileHistory('src/auth', undefined, 365 * 5);
      expect(results.length).toBe(2);
    });

    it('returns empty array for untracked files', () => {
      const results = journal.findFileHistory('nonexistent.ts', undefined, 365 * 5);
      expect(results).toEqual([]);
    });

    it('filters by project ID', () => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-10',
          projectId: 'other-project',
          todayCommits: [makeCommit({ message: 'other auth', filesChanged: ['src/auth.ts'] })],
        })
      );

      const results = journal.findFileHistory('auth.ts', 'test-project', 365 * 5);
      // Should only return results from test-project
      expect(results.length).toBe(2);
    });
  });

  // ─── getCrossProjectSummary ───────────────────────────────────────────

  describe('getCrossProjectSummary', () => {
    beforeEach(() => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-10',
          projectId: 'frontend',
          todayCommits: [makeCommit(), makeCommit()],
          categories: [{ name: 'frontend', percentage: 80 }],
          diffStats: { filesChanged: 5, insertions: 100, deletions: 20 },
        })
      );
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-11',
          projectId: 'frontend',
          todayCommits: [makeCommit()],
          categories: [{ name: 'frontend', percentage: 70 }],
          diffStats: { filesChanged: 3, insertions: 50, deletions: 10 },
        })
      );
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-10',
          projectId: 'backend',
          todayCommits: [makeCommit(), makeCommit(), makeCommit()],
          categories: [{ name: 'backend', percentage: 90 }],
          diffStats: { filesChanged: 8, insertions: 200, deletions: 50 },
        })
      );
    });

    it('returns per-project summaries', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      expect(summary.projects.length).toBe(2);
    });

    it('calculates total commits across projects', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      expect(summary.totalCommits).toBe(6); // 2 + 1 + 3
    });

    it('calculates active days', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      expect(summary.totalActiveDays).toBe(2); // June 10 and 11
    });

    it('aggregates diff stats per project', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      const frontend = summary.projects.find((p) => p.projectId === 'frontend');
      expect(frontend).toBeDefined();
      expect(frontend!.diffStats.insertions).toBe(150); // 100 + 50
      expect(frontend!.diffStats.deletions).toBe(30); // 20 + 10
    });

    it('tracks active days per project', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      const frontend = summary.projects.find((p) => p.projectId === 'frontend');
      expect(frontend!.activeDays).toBe(2);

      const backend = summary.projects.find((p) => p.projectId === 'backend');
      expect(backend!.activeDays).toBe(1);
    });

    it('sorts projects by commit count descending', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      expect(summary.projects[0].totalCommits).toBeGreaterThanOrEqual(
        summary.projects[1].totalCommits
      );
    });

    it('computes average category percentages', () => {
      const summary = journal.getCrossProjectSummary('2024-06-10', '2024-06-11');
      const frontend = summary.projects.find((p) => p.projectId === 'frontend');
      const cat = frontend!.categories.find((c) => c.name === 'frontend');
      expect(cat).toBeDefined();
      // Average of 80 and 70 = 75
      expect(cat!.percentage).toBe(75);
    });

    it('returns empty when no data in range', () => {
      const summary = journal.getCrossProjectSummary('2025-01-01', '2025-01-07');
      expect(summary.projects).toEqual([]);
      expect(summary.totalCommits).toBe(0);
    });
  });

  // ─── autoTag ──────────────────────────────────────────────────────────

  describe('autoTag', () => {
    it('tags based on branch prefix (feature/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'feature/new-thing' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('feature');
    });

    it('tags based on branch prefix (fix/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'fix/bug-123' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('bugfix');
    });

    it('tags based on branch prefix (bugfix/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'bugfix/issue-456' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('bugfix');
    });

    it('tags based on branch prefix (hotfix/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'hotfix/critical' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('hotfix');
    });

    it('tags based on branch prefix (chore/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'chore/deps' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('chore');
    });

    it('tags based on branch prefix (refactor/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'refactor/auth' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('refactor');
    });

    it('tags based on branch prefix (docs/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'docs/readme' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('docs');
    });

    it('tags based on branch prefix (release/)', () => {
      const snapshot = makeSnapshot({ currentBranch: 'release/v2.0' });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('release');
    });

    it('extracts conventional commit types from commit messages', () => {
      const snapshot = makeSnapshot({
        todayCommits: [
          makeCommit({ message: 'feat: add login' }),
          makeCommit({ message: 'fix: validation bug' }),
          makeCommit({ message: 'docs: update readme' }),
        ],
      });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('feat');
      expect(tags).toContain('fix');
      expect(tags).toContain('docs');
    });

    it('extracts ticket IDs from commit messages', () => {
      const snapshot = makeSnapshot({
        todayCommits: [
          makeCommit({ message: 'feat: PROJ-123 add login' }),
          makeCommit({ message: 'fix: resolve #42' }),
        ],
      });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('PROJ-123');
      expect(tags).toContain('#42');
    });

    it('includes high-percentage work categories', () => {
      const snapshot = makeSnapshot({
        categories: [
          { name: 'frontend', percentage: 60 },
          { name: 'tests', percentage: 30 },
          { name: 'config', percentage: 10 },
        ],
      });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('frontend');
      expect(tags).toContain('tests');
      // 10% < 20% threshold, should NOT be included
      expect(tags).not.toContain('config');
    });

    it('includes PR labels', () => {
      const snapshot = makeSnapshot({
        pullRequests: [makePR({ labels: ['bug', 'priority:high'] })],
      });
      const tags = WorkJournal.autoTag(snapshot);
      expect(tags).toContain('bug');
      expect(tags).toContain('priority:high');
    });

    it('handles snapshot with no branch prefix or conventional commits', () => {
      const snapshot = makeSnapshot({
        currentBranch: 'main',
        todayCommits: [makeCommit({ message: 'random update' })],
        categories: [],
        pullRequests: [],
      });
      const tags = WorkJournal.autoTag(snapshot);
      // Should still return an array (possibly empty)
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  // ─── formatSnapshotsForAI ─────────────────────────────────────────────

  describe('formatSnapshotsForAI', () => {
    it('returns placeholder text for empty array', () => {
      const result = WorkJournal.formatSnapshotsForAI([]);
      expect(result).toContain('No journal entries found');
    });

    it('groups by project', () => {
      const snapshots = [
        makeSnapshot({ date: '2024-06-10', projectId: 'frontend' }),
        makeSnapshot({ date: '2024-06-10', projectId: 'backend' }),
      ];
      const result = WorkJournal.formatSnapshotsForAI(snapshots);
      expect(result).toContain('frontend');
      expect(result).toContain('backend');
    });

    it('includes commit messages', () => {
      const snapshot = makeSnapshot({
        todayCommits: [makeCommit({ message: 'feat: add important feature' })],
      });
      const result = WorkJournal.formatSnapshotsForAI([snapshot]);
      expect(result).toContain('add important feature');
    });

    it('includes PR info', () => {
      const snapshot = makeSnapshot({
        pullRequests: [makePR({ number: 99, title: 'Big PR' })],
      });
      const result = WorkJournal.formatSnapshotsForAI([snapshot]);
      expect(result).toContain('#99');
      expect(result).toContain('Big PR');
    });

    it('includes notes', () => {
      const snapshot = makeSnapshot({ notes: 'Important context about the work' });
      const result = WorkJournal.formatSnapshotsForAI([snapshot]);
      expect(result).toContain('Important context about the work');
    });

    it('includes diff stats', () => {
      const snapshot = makeSnapshot({
        diffStats: { filesChanged: 10, insertions: 500, deletions: 100 },
      });
      const result = WorkJournal.formatSnapshotsForAI([snapshot]);
      expect(result).toContain('500');
      expect(result).toContain('100');
    });

    it('truncates long commit lists', () => {
      const commits: JournalCommit[] = [];
      for (let i = 0; i < 20; i++) {
        commits.push(makeCommit({ message: `commit ${i}` }));
      }
      const snapshot = makeSnapshot({ todayCommits: commits });
      const result = WorkJournal.formatSnapshotsForAI([snapshot]);
      expect(result).toContain('more commits');
    });
  });

  // ─── formatSnapshotSummary ────────────────────────────────────────────

  describe('formatSnapshotSummary', () => {
    it('includes date and project', () => {
      const snapshot = makeSnapshot({ date: '2024-06-15', projectId: 'my-proj' });
      const result = WorkJournal.formatSnapshotSummary(snapshot);
      expect(result).toContain('2024-06-15');
      expect(result).toContain('my-proj');
    });

    it('includes branch name', () => {
      const snapshot = makeSnapshot({ currentBranch: 'feature/cool-thing' });
      const result = WorkJournal.formatSnapshotSummary(snapshot);
      expect(result).toContain('feature/cool-thing');
    });

    it('includes commit count', () => {
      const snapshot = makeSnapshot({
        todayCommits: [makeCommit(), makeCommit(), makeCommit()],
      });
      const result = WorkJournal.formatSnapshotSummary(snapshot);
      expect(result).toContain('3 commit');
    });

    it('includes diff stats', () => {
      const snapshot = makeSnapshot({
        diffStats: { filesChanged: 7, insertions: 200, deletions: 50 },
      });
      const result = WorkJournal.formatSnapshotSummary(snapshot);
      expect(result).toContain('+200');
      expect(result).toContain('-50');
    });

    it('includes notes', () => {
      const snapshot = makeSnapshot({ notes: 'My custom note' });
      const result = WorkJournal.formatSnapshotSummary(snapshot);
      expect(result).toContain('My custom note');
    });

    it('includes AI summary', () => {
      const snapshot = makeSnapshot({ aiSummary: 'AI generated insight' });
      const result = WorkJournal.formatSnapshotSummary(snapshot);
      expect(result).toContain('AI generated insight');
    });
  });

  // ─── prune ────────────────────────────────────────────────────────────

  describe('prune', () => {
    it('removes entries older than the specified number of days', () => {
      // Create an old entry
      const oldDate = '2020-01-01';
      journal.saveSnapshot(makeSnapshot({ date: oldDate }));
      journal.saveSnapshot(makeSnapshot({ date: journal.todayString() }));

      // Prune entries older than 30 days
      const result = journal.prune(30);

      expect(result.removedDates).toContain(oldDate);
      expect(result.removedSnapshots).toBeGreaterThan(0);

      // Today's snapshot should still exist
      expect(journal.getSnapshot(journal.todayString(), 'test-project')).not.toBeNull();
    });

    it('returns zero counts when nothing to prune', () => {
      journal.saveSnapshot(makeSnapshot({ date: journal.todayString() }));
      const result = journal.prune(30);
      expect(result.removedDates.length).toBe(0);
      expect(result.removedSnapshots).toBe(0);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zero stats for empty journal', () => {
      const stats = journal.getStats();
      expect(stats.totalSnapshots).toBe(0);
      expect(stats.totalDates).toBe(0);
      expect(stats.totalProjects).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });

    it('returns correct stats for populated journal', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-10', projectId: 'a' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-12', projectId: 'a' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-12', projectId: 'b' }));

      const stats = journal.getStats();
      expect(stats.totalSnapshots).toBe(3);
      expect(stats.totalDates).toBe(2);
      expect(stats.totalProjects).toBe(2);
      expect(stats.oldestEntry).toBe('2024-06-10');
      expect(stats.newestEntry).toBe('2024-06-12');
      expect(stats.storageBytes).toBeGreaterThan(0);
    });
  });

  // ─── sanitizeProjectId ────────────────────────────────────────────────

  describe('sanitizeProjectId', () => {
    it('lowercases the name', () => {
      expect(WorkJournal.sanitizeProjectId('MyProject')).toBe('myproject');
    });

    it('replaces path separators with hyphens', () => {
      expect(WorkJournal.sanitizeProjectId('owner/repo')).toBe('owner-repo');
    });

    it('replaces special characters with hyphens', () => {
      expect(WorkJournal.sanitizeProjectId('my:project*name')).toBe('my-project-name');
    });

    it('removes leading dots', () => {
      expect(WorkJournal.sanitizeProjectId('..hidden')).toBe('hidden');
    });

    it('replaces spaces with hyphens', () => {
      expect(WorkJournal.sanitizeProjectId('my project name')).toBe('my-project-name');
    });

    it('truncates long names to 100 characters', () => {
      const longName = 'a'.repeat(200);
      expect(WorkJournal.sanitizeProjectId(longName).length).toBeLessThanOrEqual(100);
    });
  });

  // ─── dateToString / todayString ───────────────────────────────────────

  describe('date helpers', () => {
    it('dateToString formats correctly', () => {
      const date = new Date(2024, 5, 15); // June 15, 2024
      expect(journal.dateToString(date)).toBe('2024-06-15');
    });

    it('dateToString pads single-digit months and days', () => {
      const date = new Date(2024, 0, 5); // Jan 5, 2024
      expect(journal.dateToString(date)).toBe('2024-01-05');
    });

    it('todayString returns today in YYYY-MM-DD format', () => {
      const today = journal.todayString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(today).toBe(expected);
    });
  });

  // ─── Merge Logic Edge Cases ───────────────────────────────────────────

  describe('merge edge cases', () => {
    it('handles merge with empty incoming notes when existing has notes', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', notes: 'existing note' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', notes: undefined }));

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.notes).toBe('existing note');
    });

    it('merges active branches from both snapshots', () => {
      const branch1 = makeBranch({ name: 'feature/a' });
      const branch2 = makeBranch({ name: 'feature/b' });

      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', activeBranches: [branch1] }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', activeBranches: [branch2] }));

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.activeBranches.length).toBe(2);
      const names = snap!.activeBranches.map((b) => b.name).sort();
      expect(names).toContain('feature/a');
      expect(names).toContain('feature/b');
    });

    it('merges PRs from both snapshots, deduplicating by number', () => {
      const pr1 = makePR({ number: 1, title: 'PR 1' });
      const pr2 = makePR({ number: 2, title: 'PR 2' });
      const pr1Updated = makePR({ number: 1, title: 'PR 1 - updated', state: 'merged' });

      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', pullRequests: [pr1, pr2] }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', pullRequests: [pr1Updated] }));

      const snap = journal.getSnapshot('2024-06-15', 'test-project');
      expect(snap!.pullRequests.length).toBe(2);
      const pr1Result = snap!.pullRequests.find((pr) => pr.number === 1);
      // Incoming PR should win on duplicates
      expect(pr1Result!.title).toBe('PR 1 - updated');
      expect(pr1Result!.state).toBe('merged');
    });

    it('handles corrupted existing file during save (overwrites)', () => {
      const dateDir = join(testDir, '2024-06-15');
      mkdirSync(dateDir, { recursive: true });
      writeFileSync(join(dateDir, 'test-project.json'), 'CORRUPTED DATA', 'utf-8');

      const snapshot = makeSnapshot({ date: '2024-06-15' });
      journal.saveSnapshot(snapshot);

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved).not.toBeNull();
      expect(saved!.projectId).toBe('test-project');
    });
  });

  // ─── Index Integrity ──────────────────────────────────────────────────

  describe('index management', () => {
    it('creates index on first save', () => {
      const indexPath = join(testDir, 'index.json');
      expect(existsSync(indexPath)).toBe(false);

      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15' }));
      expect(existsSync(indexPath)).toBe(true);
    });

    it('updates index with correct metadata', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-10', projectId: 'proj' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'proj' }));

      const indexPath = join(testDir, 'index.json');
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));

      expect(index.version).toBe(1);
      expect(index.projects.length).toBe(1);
      expect(index.projects[0].projectId).toBe('proj');
      expect(index.projects[0].lastSnapshotDate).toBe('2024-06-15');
      expect(index.projects[0].snapshotCount).toBe(2);
      expect(index.projects[0].firstSeen).toBe('2024-06-10');
    });

    it('handles corrupted index gracefully', () => {
      const indexPath = join(testDir, 'index.json');
      writeFileSync(indexPath, 'BROKEN INDEX', 'utf-8');

      // Should not throw, should create a fresh index
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15' }));

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved).not.toBeNull();
    });

    it('tracks multiple projects in the index', () => {
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'alpha' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'beta' }));
      journal.saveSnapshot(makeSnapshot({ date: '2024-06-15', projectId: 'gamma' }));

      const projects = journal.getProjects();
      expect(projects.length).toBe(3);
    });
  });

  // ─── Concurrent / Stress Scenarios ────────────────────────────────────

  describe('stress scenarios', () => {
    it('handles many snapshots across many dates', () => {
      // Save 30 days of snapshots
      for (let i = 0; i < 30; i++) {
        const date = `2024-06-${String(i + 1).padStart(2, '0')}`;
        journal.saveSnapshot(
          makeSnapshot({
            date,
            todayCommits: [makeCommit(), makeCommit()],
          })
        );
      }

      const stats = journal.getStats();
      expect(stats.totalSnapshots).toBe(30);
      expect(stats.totalDates).toBe(30);

      // Search should still work
      const results = journal.search({ query: 'test commit' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('handles many projects on the same date', () => {
      for (let i = 0; i < 10; i++) {
        journal.saveSnapshot(
          makeSnapshot({
            date: '2024-06-15',
            projectId: `project-${i}`,
          })
        );
      }

      const daySnapshots = journal.getSnapshotsForDate('2024-06-15');
      expect(daySnapshots.length).toBe(10);
    });

    it('handles snapshot with many commits', () => {
      const commits: JournalCommit[] = [];
      for (let i = 0; i < 100; i++) {
        commits.push(makeCommit({ message: `commit #${i}: doing things` }));
      }

      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-15',
          todayCommits: commits,
        })
      );

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.todayCommits.length).toBe(100);
    });
  });

  // ─── Empty / Minimal Snapshots ────────────────────────────────────────

  describe('minimal snapshots', () => {
    it('handles snapshot with no commits', () => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-15',
          todayCommits: [],
          recentCommits: [],
        })
      );

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved).not.toBeNull();
      expect(saved!.todayCommits).toEqual([]);
    });

    it('handles snapshot with null diffStats', () => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-15',
          diffStats: null,
        })
      );

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.diffStats).toBeNull();
    });

    it('handles snapshot with empty tags', () => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-15',
          tags: [],
        })
      );

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved!.tags).toEqual([]);
    });

    it('handles snapshot with all optional fields empty', () => {
      journal.saveSnapshot(
        makeSnapshot({
          date: '2024-06-15',
          todayCommits: [],
          recentCommits: [],
          activeBranches: [],
          pullRequests: [],
          tickets: [],
          categories: [],
          topChangedFiles: [],
          diffStats: null,
          notes: undefined,
          aiSummary: undefined,
          tags: [],
          remoteUrl: undefined,
        })
      );

      const saved = journal.getSnapshot('2024-06-15', 'test-project');
      expect(saved).not.toBeNull();
    });
  });
});
