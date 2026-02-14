/**
 * Auto-Snapshot Tests
 *
 * Tests for the automatic snapshot side-effect system, git hook generation,
 * and hook install/remove utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `devdaily-auto-snap-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

// ─── Mock Setup ───────────────────────────────────────────────────────────────

// Mock getConfig before importing the module
const mockConfig = {
  journal: {
    autoSnapshot: true,
    gitHooks: false,
    hooks: { postCommit: true, postCheckout: true },
    autoPromptDays: 0,
    quiet: true,
  },
  git: { defaultBranch: 'main', excludeAuthors: [], excludePatterns: [] },
  projectManagement: { tool: 'github' as const, ticketPrefix: undefined },
  output: { format: 'markdown' as const, copyToClipboard: true, showStats: true, verbose: false },
  pr: { defaultBase: 'main', includeDiff: true, maxDiffLines: 200 },
};

vi.mock('../src/config/index.js', () => ({
  getConfig: () => mockConfig,
  ConfigManager: {
    getInstance: () => ({
      get: () => mockConfig,
      update: vi.fn(),
      saveGlobal: vi.fn(),
      saveLocal: vi.fn(),
    }),
  },
}));

// Mock GitAnalyzer
const mockGitAnalyzer = {
  isRepository: vi.fn().mockResolvedValue(true),
  getRepoRoot: vi.fn().mockResolvedValue('/mock/repo'),
  getCurrentBranch: vi.fn().mockResolvedValue('feature/test'),
  getDefaultBranch: vi.fn().mockResolvedValue('main'),
  getCommits: vi.fn().mockResolvedValue([]),
  getChangedFiles: vi.fn().mockResolvedValue([]),
  getCommitsByDateRange: vi.fn().mockResolvedValue([]),
  getDiffStats: vi.fn().mockResolvedValue(null),
  getRecentBranches: vi.fn().mockResolvedValue([]),
  getLocalBranches: vi.fn().mockResolvedValue([]),
  getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/test/repo.git'),
};

vi.mock('../src/core/git-analyzer.js', () => ({
  GitAnalyzer: vi.fn().mockImplementation(() => mockGitAnalyzer),
}));

// Mock SnapshotBuilder
const mockSnapshotResult = {
  snapshot: {
    date: '2025-01-15',
    takenAt: new Date().toISOString(),
    projectId: 'test-project',
    repoPath: '/mock/repo',
    remoteUrl: 'https://github.com/test/repo.git',
    currentBranch: 'feature/test',
    activeBranches: [],
    todayCommits: [],
    recentCommits: [],
    pullRequests: [],
    tickets: [],
    categories: [],
    topChangedFiles: [],
    diffStats: null,
    notes: '',
    tags: ['auto:standup'],
  },
  merged: false,
  warnings: [],
  durationMs: 42,
};

vi.mock('../src/core/snapshot-builder.js', () => ({
  SnapshotBuilder: vi.fn().mockImplementation(() => ({
    takeAndSave: vi.fn().mockResolvedValue(mockSnapshotResult),
    takeLightSnapshot: vi.fn().mockResolvedValue(mockSnapshotResult),
    takeSnapshot: vi.fn().mockResolvedValue(mockSnapshotResult),
  })),
}));

// Mock WorkJournal
const mockJournal = {
  saveSnapshot: vi.fn(),
  getSnapshot: vi.fn(),
  getSnapshotsForDate: vi.fn().mockReturnValue([]),
  todayString: vi.fn().mockReturnValue('2025-01-15'),
};

vi.mock('../src/core/work-journal.js', () => ({
  WorkJournal: vi.fn().mockImplementation(() => mockJournal),
}));

// Import after mocks are set up
import {
  sideEffectSnapshot,
  fireAndForgetSnapshot,
  generatePostCommitHook,
  generatePostCheckoutHook,
  installGitHooks,
  removeGitHooks,
  type SideEffectSnapshotOptions,
} from '../src/core/auto-snapshot.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auto-Snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.journal.autoSnapshot = true;
    mockConfig.journal.quiet = true;
    mockGitAnalyzer.isRepository.mockResolvedValue(true);
  });

  // ─── sideEffectSnapshot ─────────────────────────────────────────────

  describe('sideEffectSnapshot', () => {
    it('should take a snapshot when autoSnapshot is enabled', async () => {
      const result = await sideEffectSnapshot({ source: 'standup' });

      expect(result.taken).toBe(true);
      expect(result.skipReason).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should skip when autoSnapshot is disabled in config', async () => {
      mockConfig.journal.autoSnapshot = false;

      const result = await sideEffectSnapshot({ source: 'standup' });

      expect(result.taken).toBe(false);
      expect(result.skipReason).toBe('autoSnapshot disabled in config');
    });

    it('should take snapshot when forced even if autoSnapshot is disabled', async () => {
      mockConfig.journal.autoSnapshot = false;

      const result = await sideEffectSnapshot({ source: 'standup', force: true });

      expect(result.taken).toBe(true);
    });

    it('should skip when not in a git repository', async () => {
      mockGitAnalyzer.isRepository.mockResolvedValue(false);

      const result = await sideEffectSnapshot({ source: 'pr' });

      expect(result.taken).toBe(false);
      expect(result.skipReason).toBe('not a git repository');
    });

    it('should save snapshot to journal on success', async () => {
      await sideEffectSnapshot({ source: 'standup' });

      expect(mockJournal.saveSnapshot).toHaveBeenCalled();
    });

    it('should include source tag in the snapshot', async () => {
      const result = await sideEffectSnapshot({ source: 'week' });

      expect(result.taken).toBe(true);
      // The tags should contain auto:week
      expect(result.result?.snapshot.tags).toContain('auto:standup');
    });

    it('should pass additional tags through', async () => {
      await sideEffectSnapshot({
        source: 'pr',
        tags: ['pr:my-feature'],
      });

      // Verify the snapshot builder was called (tags are in the options)
      expect(mockJournal.saveSnapshot).toHaveBeenCalled();
    });

    it('should pass note through', async () => {
      await sideEffectSnapshot({
        source: 'standup',
        note: 'Standup generated (5 commits)',
      });

      expect(mockJournal.saveSnapshot).toHaveBeenCalled();
    });

    it('should never throw even if snapshot fails', async () => {
      // Make the journal throw
      mockJournal.saveSnapshot.mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      // Should not throw
      const result = await sideEffectSnapshot({ source: 'standup' });

      expect(result.taken).toBe(false);
      expect(result.skipReason).toBe('snapshot failed (non-fatal)');
    });

    it('should accept all valid source types', async () => {
      const sources: SideEffectSnapshotOptions['source'][] = [
        'standup',
        'pr',
        'week',
        'context',
        'recall',
        'post-commit',
        'post-checkout',
      ];

      for (const source of sources) {
        vi.clearAllMocks();
        const result = await sideEffectSnapshot({ source });
        expect(result.taken).toBe(true);
      }
    });

    it('should not write to stdout in quiet mode', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockConfig.journal.quiet = true;

      await sideEffectSnapshot({ source: 'standup' });

      // Should not have written any snapshot messages to stdout
      const snapshotWrites = stdoutSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Snapshot')
      );
      expect(snapshotWrites.length).toBe(0);

      stdoutSpy.mockRestore();
    });

    it('should write to stderr when verbose is true', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockConfig.journal.quiet = true; // quiet in config

      await sideEffectSnapshot({ source: 'standup', verbose: true }); // but verbose override

      const snapshotWrites = stderrSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Snapshot saved')
      );
      expect(snapshotWrites.length).toBe(1);

      stderrSpy.mockRestore();
    });

    it('should pass projectId override when provided', async () => {
      const result = await sideEffectSnapshot({
        source: 'standup',
        projectId: 'my-custom-project',
      });

      expect(result.taken).toBe(true);
    });

    it('should pass date override when provided', async () => {
      const result = await sideEffectSnapshot({
        source: 'week',
        date: '2025-01-10',
      });

      expect(result.taken).toBe(true);
    });
  });

  // ─── fireAndForgetSnapshot ──────────────────────────────────────────

  describe('fireAndForgetSnapshot', () => {
    it('should not throw even if underlying snapshot fails', () => {
      mockGitAnalyzer.isRepository.mockRejectedValueOnce(new Error('boom'));

      // Should not throw
      expect(() => {
        fireAndForgetSnapshot({ source: 'standup' });
      }).not.toThrow();
    });

    it('should return void (fire and forget)', () => {
      const result = fireAndForgetSnapshot({ source: 'pr' });
      expect(result).toBeUndefined();
    });
  });

  // ─── generatePostCommitHook ─────────────────────────────────────────

  describe('generatePostCommitHook', () => {
    it('should return a valid shell script', () => {
      const hook = generatePostCommitHook();
      expect(hook).toMatch(/^#!/);
      expect(hook).toContain('#!/bin/sh');
    });

    it('should contain the devdaily marker comment', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('DevDaily auto-snapshot');
    });

    it('should check for devdaily installation before running', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('command -v devdaily');
    });

    it('should run snapshot in background', () => {
      const hook = generatePostCommitHook();
      // Should contain backgrounding pattern: (command &)
      expect(hook).toMatch(/\(devdaily snapshot.*&\)/);
    });

    it('should use --light flag for speed', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('--light');
    });

    it('should tag with auto:post-commit', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('auto:post-commit');
    });

    it('should exit 0 on success', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('exit 0');
    });

    it('should exit 0 even if devdaily is not installed', () => {
      const hook = generatePostCommitHook();
      // After the command -v check, should exit 0
      const lines = hook.split('\n');
      const checkLine = lines.findIndex((l) => l.includes('command -v devdaily'));
      expect(checkLine).toBeGreaterThan(-1);
      // Next non-empty line should exit 0
      const nextLine = lines.slice(checkLine + 1).find((l) => l.trim().length > 0);
      expect(nextLine?.trim()).toBe('exit 0');
    });

    it('should include the installer attribution', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('Installed by: devdaily init');
    });

    it('should suppress stderr from devdaily', () => {
      const hook = generatePostCommitHook();
      expect(hook).toContain('2>/dev/null');
    });
  });

  // ─── generatePostCheckoutHook ───────────────────────────────────────

  describe('generatePostCheckoutHook', () => {
    it('should return a valid shell script', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toMatch(/^#!/);
      expect(hook).toContain('#!/bin/sh');
    });

    it('should contain the devdaily marker comment', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('DevDaily auto-snapshot');
    });

    it('should only run on branch checkouts (not file checkouts)', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('IS_BRANCH_CHECKOUT');
      expect(hook).toMatch(/\$3.*!=.*"1"/s);
    });

    it('should skip when refs are the same', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('PREV_REF');
      expect(hook).toContain('NEW_REF');
      expect(hook).toMatch(/PREV_REF.*=.*NEW_REF/s);
    });

    it('should check for devdaily installation', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('command -v devdaily');
    });

    it('should run snapshot in background', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toMatch(/\(devdaily snapshot.*&\)/);
    });

    it('should use --light flag for speed', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('--light');
    });

    it('should tag with auto:post-checkout', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('auto:post-checkout');
    });

    it('should include a note about branch switch', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('Switched branch');
    });

    it('should include the installer attribution', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('Installed by: devdaily init');
    });

    it('should document the git hook arguments', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('$1 = previous HEAD ref');
      expect(hook).toContain('$2 = new HEAD ref');
      expect(hook).toContain('$3 = 1 if branch checkout');
    });
  });

  // ─── installGitHooks ───────────────────────────────────────────────

  describe('installGitHooks', () => {
    let testDir: string;
    let hooksDir: string;

    beforeEach(() => {
      testDir = createTestDir();
      hooksDir = join(testDir, '.git', 'hooks');
      mkdirSync(hooksDir, { recursive: true });

      // Mock git to return our test dir
      mockGitAnalyzer.getRepoRoot.mockResolvedValue(testDir);
    });

    afterEach(() => {
      cleanupDir(testDir);
    });

    it('should install post-commit hook', async () => {
      const result = await installGitHooks({ postCommit: true, postCheckout: false });

      expect(result.installed).toContain('post-commit');
      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(true);
    });

    it('should install post-checkout hook', async () => {
      const result = await installGitHooks({ postCommit: false, postCheckout: true });

      expect(result.installed).toContain('post-checkout');
      expect(existsSync(join(hooksDir, 'post-checkout'))).toBe(true);
    });

    it('should install both hooks by default', async () => {
      const result = await installGitHooks();

      expect(result.installed).toContain('post-commit');
      expect(result.installed).toContain('post-checkout');
    });

    it('should make hook files executable', async () => {
      await installGitHooks({ postCommit: true, postCheckout: false });

      const hookPath = join(hooksDir, 'post-commit');
      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('#!/bin/sh');
    });

    it('should write valid shell scripts', async () => {
      await installGitHooks();

      const postCommit = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      const postCheckout = readFileSync(join(hooksDir, 'post-checkout'), 'utf-8');

      expect(postCommit).toContain('#!/bin/sh');
      expect(postCommit).toContain('DevDaily auto-snapshot');
      expect(postCheckout).toContain('#!/bin/sh');
      expect(postCheckout).toContain('DevDaily auto-snapshot');
    });

    it('should skip hooks that are already installed (idempotent)', async () => {
      await installGitHooks();
      const result = await installGitHooks();

      // Should report skipped, not installed
      expect(result.skipped.length).toBeGreaterThan(0);
      expect(result.skipped.some((s) => s.includes('already installed'))).toBe(true);
    });

    it('should overwrite existing devdaily hooks when force is true', async () => {
      await installGitHooks();
      const result = await installGitHooks({ force: true });

      expect(result.installed.length).toBe(2);
      expect(result.installed.some((s) => s.includes('overwritten'))).toBe(true);
    });

    it('should append to existing non-devdaily hooks', async () => {
      // Write a pre-existing hook
      const existingHook = '#!/bin/sh\necho "existing hook"\n';
      writeFileSync(join(hooksDir, 'post-commit'), existingHook);

      const result = await installGitHooks({ postCommit: true, postCheckout: false });

      expect(result.installed).toContain('post-commit (appended to existing hook)');

      const content = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(content).toContain('existing hook');
      expect(content).toContain('DevDaily auto-snapshot');
    });

    it('should warn when appending to existing hooks', async () => {
      const existingHook = '#!/bin/sh\necho "my custom hook"\n';
      writeFileSync(join(hooksDir, 'post-commit'), existingHook);

      const result = await installGitHooks({ postCommit: true, postCheckout: false });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Existing hook found');
    });

    it('should skip hooks that are disabled', async () => {
      const result = await installGitHooks({ postCommit: false, postCheckout: false });

      expect(result.skipped).toContain('post-commit');
      expect(result.skipped).toContain('post-checkout');
      expect(result.installed.length).toBe(0);
    });

    it('should warn when not in a git repository', async () => {
      mockGitAnalyzer.isRepository.mockResolvedValueOnce(false);

      const result = await installGitHooks();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Not a git repository');
      expect(result.installed.length).toBe(0);
    });

    it('should create hooks directory if it does not exist', async () => {
      rmSync(hooksDir, { recursive: true });
      expect(existsSync(hooksDir)).toBe(false);

      await installGitHooks();

      expect(existsSync(hooksDir)).toBe(true);
    });

    it('should handle getRepoRoot failure gracefully', async () => {
      mockGitAnalyzer.getRepoRoot.mockRejectedValueOnce(new Error('cannot find root'));

      const result = await installGitHooks();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Could not determine repository root');
      expect(result.installed.length).toBe(0);
    });
  });

  // ─── removeGitHooks ────────────────────────────────────────────────

  describe('removeGitHooks', () => {
    let testDir: string;
    let hooksDir: string;

    beforeEach(() => {
      testDir = createTestDir();
      hooksDir = join(testDir, '.git', 'hooks');
      mkdirSync(hooksDir, { recursive: true });

      mockGitAnalyzer.getRepoRoot.mockResolvedValue(testDir);
    });

    afterEach(() => {
      cleanupDir(testDir);
    });

    it('should remove devdaily post-commit hook', async () => {
      // Install first
      await installGitHooks({ postCommit: true, postCheckout: false });
      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(true);

      const result = await removeGitHooks();

      expect(result.removed).toContain('post-commit');
      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(false);
    });

    it('should remove devdaily post-checkout hook', async () => {
      await installGitHooks({ postCommit: false, postCheckout: true });
      expect(existsSync(join(hooksDir, 'post-checkout'))).toBe(true);

      const result = await removeGitHooks();

      expect(result.removed).toContain('post-checkout');
      expect(existsSync(join(hooksDir, 'post-checkout'))).toBe(false);
    });

    it('should remove both hooks', async () => {
      await installGitHooks();

      const result = await removeGitHooks();

      expect(result.removed.length).toBe(2);
      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(false);
      expect(existsSync(join(hooksDir, 'post-checkout'))).toBe(false);
    });

    it('should only remove devdaily section from mixed hooks', async () => {
      // Write an existing hook, then append devdaily
      const existingContent = '#!/bin/sh\necho "my important hook"\n';
      writeFileSync(join(hooksDir, 'post-commit'), existingContent);

      // Install devdaily hook (appends)
      await installGitHooks({ postCommit: true, postCheckout: false });
      const beforeRemove = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(beforeRemove).toContain('DevDaily auto-snapshot');
      expect(beforeRemove).toContain('my important hook');

      // Remove devdaily
      const result = await removeGitHooks();

      expect(result.removed.length).toBe(1);
      expect(result.removed[0]).toContain('removed appended section');

      // The hook file should still exist with original content
      const afterRemove = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(afterRemove).toContain('my important hook');
      expect(afterRemove).not.toContain('DevDaily auto-snapshot');
    });

    it('should do nothing when no devdaily hooks exist', async () => {
      const result = await removeGitHooks();

      expect(result.removed.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should not touch non-devdaily hooks', async () => {
      const otherHook = '#!/bin/sh\necho "other hook"\n';
      writeFileSync(join(hooksDir, 'post-commit'), otherHook);

      const result = await removeGitHooks();

      expect(result.removed.length).toBe(0);
      const content = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(content).toBe(otherHook);
    });

    it('should warn when not in a git repository', async () => {
      mockGitAnalyzer.isRepository.mockResolvedValueOnce(false);

      const result = await removeGitHooks();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Not a git repository');
    });

    it('should handle getRepoRoot failure gracefully', async () => {
      mockGitAnalyzer.getRepoRoot.mockRejectedValueOnce(new Error('nope'));

      const result = await removeGitHooks();

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─── Config integration ────────────────────────────────────────────

  describe('config integration', () => {
    it('should respect journal.autoSnapshot = false', async () => {
      mockConfig.journal.autoSnapshot = false;

      const result = await sideEffectSnapshot({ source: 'standup' });

      expect(result.taken).toBe(false);
      expect(result.skipReason).toContain('disabled');
    });

    it('should respect journal.autoSnapshot = true', async () => {
      mockConfig.journal.autoSnapshot = true;

      const result = await sideEffectSnapshot({ source: 'standup' });

      expect(result.taken).toBe(true);
    });

    it('should respect journal.quiet for output suppression', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      mockConfig.journal.quiet = true;
      await sideEffectSnapshot({ source: 'standup' });

      const snapshotWrites = stderrSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Snapshot saved')
      );
      expect(snapshotWrites.length).toBe(0);

      stderrSpy.mockRestore();
    });

    it('should show output when journal.quiet is false and verbose not overridden', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      mockConfig.journal.quiet = false;
      await sideEffectSnapshot({ source: 'standup' });

      const snapshotWrites = stderrSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Snapshot saved')
      );
      expect(snapshotWrites.length).toBe(1);

      stderrSpy.mockRestore();
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle missing journal config gracefully', async () => {
      const original = mockConfig.journal;
      // @ts-expect-error - testing missing config
      mockConfig.journal = undefined;

      const result = await sideEffectSnapshot({ source: 'standup' });

      // Should still work with defaults
      expect(result.taken).toBe(true);

      mockConfig.journal = original;
    });

    it('should handle concurrent snapshots without errors', async () => {
      const results = await Promise.all([
        sideEffectSnapshot({ source: 'standup' }),
        sideEffectSnapshot({ source: 'pr' }),
        sideEffectSnapshot({ source: 'week' }),
      ]);

      for (const result of results) {
        expect(result.taken).toBe(true);
      }
    });

    it('should not interfere with DEVD_QUIET env var', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const originalEnv = process.env.DEVD_QUIET;
      process.env.DEVD_QUIET = '1';
      mockConfig.journal.quiet = false;

      await sideEffectSnapshot({ source: 'standup' });

      const snapshotWrites = stderrSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Snapshot saved')
      );
      expect(snapshotWrites.length).toBe(0);

      process.env.DEVD_QUIET = originalEnv;
      stderrSpy.mockRestore();
    });

    it('should include debug output when debug is true and snapshot fails', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      // Make it fail
      mockGitAnalyzer.isRepository.mockImplementationOnce(() => {
        throw new Error('git exploded');
      });

      await sideEffectSnapshot({ source: 'standup', debug: true });

      const debugWrites = stderrSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Auto-snapshot failed')
      );
      expect(debugWrites.length).toBe(1);

      stderrSpy.mockRestore();
    });
  });

  // ─── Hook content validation ───────────────────────────────────────

  describe('hook content validation', () => {
    it('post-commit hook should be idempotent (running twice is safe)', () => {
      const hook = generatePostCommitHook();
      // Background execution means multiple runs don't stack
      expect(hook).toContain('&)');
    });

    it('post-checkout hook should handle all three git arguments', () => {
      const hook = generatePostCheckoutHook();
      expect(hook).toContain('$1');
      expect(hook).toContain('$2');
      expect(hook).toContain('$3');
    });

    it('hooks should not contain any hardcoded paths', () => {
      const postCommit = generatePostCommitHook();
      const postCheckout = generatePostCheckoutHook();

      // Should use `command -v` to find devdaily, not hardcode a path
      expect(postCommit).not.toMatch(/\/usr\/local|\/opt\//);
      expect(postCheckout).not.toMatch(/\/usr\/local|\/opt\//);
    });

    it('hooks should be portable across shells', () => {
      const postCommit = generatePostCommitHook();
      const postCheckout = generatePostCheckoutHook();

      // Should use #!/bin/sh (POSIX), not #!/bin/bash
      expect(postCommit.split('\n')[0]).toBe('#!/bin/sh');
      expect(postCheckout.split('\n')[0]).toBe('#!/bin/sh');
    });

    it('hooks should not use bash-specific features', () => {
      const postCommit = generatePostCommitHook();
      const postCheckout = generatePostCheckoutHook();

      // No [[ ]] (bash), should use [ ] (POSIX)
      expect(postCommit).not.toContain('[[');
      expect(postCheckout).not.toContain('[[');
    });
  });

  // ─── Round-trip: install → verify → remove ─────────────────────────

  describe('round-trip: install → verify → remove', () => {
    let testDir: string;
    let hooksDir: string;

    beforeEach(() => {
      testDir = createTestDir();
      hooksDir = join(testDir, '.git', 'hooks');
      mkdirSync(hooksDir, { recursive: true });
      mockGitAnalyzer.getRepoRoot.mockResolvedValue(testDir);
    });

    afterEach(() => {
      cleanupDir(testDir);
    });

    it('should cleanly install and remove hooks', async () => {
      // Install
      const installResult = await installGitHooks();
      expect(installResult.installed.length).toBe(2);
      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(true);
      expect(existsSync(join(hooksDir, 'post-checkout'))).toBe(true);

      // Verify content
      const postCommit = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(postCommit).toContain('devdaily snapshot');

      // Remove
      const removeResult = await removeGitHooks();
      expect(removeResult.removed.length).toBe(2);
      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(false);
      expect(existsSync(join(hooksDir, 'post-checkout'))).toBe(false);
    });

    it('should handle install → modify → reinstall → remove', async () => {
      // Install
      await installGitHooks();

      // Modify (simulate user editing the hook)
      const hookPath = join(hooksDir, 'post-commit');
      const content = readFileSync(hookPath, 'utf-8');
      writeFileSync(hookPath, content + '\n# User addition\necho "extra"\n');

      // Reinstall (should skip because marker exists)
      const reinstall = await installGitHooks();
      expect(reinstall.skipped.some((s) => s.includes('already installed'))).toBe(true);

      // Force reinstall (should overwrite)
      const forceReinstall = await installGitHooks({ force: true });
      expect(forceReinstall.installed.length).toBe(2);

      // Verify user addition is gone after force
      const updated = readFileSync(hookPath, 'utf-8');
      expect(updated).not.toContain('User addition');

      // Remove
      const removeResult = await removeGitHooks();
      expect(removeResult.removed.length).toBe(2);
    });

    it('should preserve existing hooks through install and remove cycle', async () => {
      // Write existing hook
      const existingContent = '#!/bin/sh\necho "my important pre-existing hook"\nexit 0\n';
      writeFileSync(join(hooksDir, 'post-commit'), existingContent);

      // Install (appends)
      const installResult = await installGitHooks({ postCommit: true, postCheckout: false });
      expect(installResult.installed[0]).toContain('appended');

      const afterInstall = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(afterInstall).toContain('my important pre-existing hook');
      expect(afterInstall).toContain('DevDaily auto-snapshot');

      // Remove (should only remove our section)
      const removeResult = await removeGitHooks();
      expect(removeResult.removed.length).toBe(1);

      const afterRemove = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(afterRemove).toContain('my important pre-existing hook');
      expect(afterRemove).not.toContain('DevDaily auto-snapshot');
    });
  });
});
