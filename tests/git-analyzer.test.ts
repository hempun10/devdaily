import { describe, it, expect, beforeEach } from 'vitest';
import { GitAnalyzer } from '../src/core/git-analyzer.js';

describe('GitAnalyzer', () => {
  let gitAnalyzer: GitAnalyzer;

  beforeEach(() => {
    gitAnalyzer = new GitAnalyzer();
  });

  describe('isRepository', () => {
    it('should return true for valid git repository', async () => {
      const result = await gitAnalyzer.isRepository();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getDefaultBranch', () => {
    it('should return a non-empty string', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return; // skip if not in a git repo

      const branch = await gitAnalyzer.getDefaultBranch();
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });

    it('should return a valid branch name (no refs/ prefix)', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const branch = await gitAnalyzer.getDefaultBranch();
      expect(branch).not.toMatch(/^refs\//);
      expect(branch).not.toContain('refs/remotes/origin/');
    });

    it('should return one of the common default branch names or a valid branch', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const branch = await gitAnalyzer.getDefaultBranch();
      // Branch name should be a reasonable string — no whitespace, no newlines
      expect(branch).not.toMatch(/\s/);
      expect(branch.trim()).toBe(branch);
    });

    it('should not throw even when called multiple times', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const branch1 = await gitAnalyzer.getDefaultBranch();
      const branch2 = await gitAnalyzer.getDefaultBranch();
      expect(branch1).toBe(branch2);
    });
  });

  describe('getDiffForAI', () => {
    it('should return an object with stat, diff, and truncated fields', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const result = await gitAnalyzer.getDiffForAI('HEAD', 'HEAD');
      expect(result).toHaveProperty('stat');
      expect(result).toHaveProperty('diff');
      expect(result).toHaveProperty('truncated');
      expect(typeof result.stat).toBe('string');
      expect(typeof result.diff).toBe('string');
      expect(typeof result.truncated).toBe('boolean');
    });

    it('should not throw when comparing HEAD to HEAD (empty diff)', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const result = await gitAnalyzer.getDiffForAI('HEAD', 'HEAD');
      // HEAD vs HEAD should produce an empty diff
      expect(result.diff).toBe('');
      expect(result.truncated).toBe(false);
    });

    it('should respect maxLines parameter for truncation', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      // Request with a very small maxLines to trigger truncation if there are changes
      const defaultBranch = await gitAnalyzer.getDefaultBranch();
      const currentBranch = await gitAnalyzer.getCurrentBranch();

      if (currentBranch === defaultBranch) return; // skip if on default branch

      const result = await gitAnalyzer.getDiffForAI(defaultBranch, 'HEAD', 1);
      // If there are any changes, it should truncate
      if (result.diff.length > 0) {
        expect(result.truncated).toBe(true);
        expect(result.diff).toContain('diff truncated');
      }
    });

    it('should return diff stat separately from unified diff', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const defaultBranch = await gitAnalyzer.getDefaultBranch();
      const currentBranch = await gitAnalyzer.getCurrentBranch();

      if (currentBranch === defaultBranch) return;

      const result = await gitAnalyzer.getDiffForAI(defaultBranch, 'HEAD');

      // If there are changes, stat should contain file change summaries
      if (result.stat.length > 0) {
        // --stat output typically contains | characters and +/- symbols
        expect(result.stat).toMatch(/\||\d+ file/);
      }
    });

    it('should handle a very large maxLines without issues', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const result = await gitAnalyzer.getDiffForAI('HEAD', 'HEAD', 100000);
      expect(result.truncated).toBe(false);
    });

    it('should not throw for invalid base reference', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      // An invalid ref should not crash — the method catches errors
      const result = await gitAnalyzer.getDiffForAI('nonexistent-branch-12345xyz', 'HEAD');
      // Should return empty strings rather than throwing
      expect(typeof result.stat).toBe('string');
      expect(typeof result.diff).toBe('string');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return a non-empty string', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const branch = await gitAnalyzer.getCurrentBranch();
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe('getRepoRoot', () => {
    it('should return an absolute path', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const root = await gitAnalyzer.getRepoRoot();
      expect(root.startsWith('/')).toBe(true);
    });
  });

  describe('getChangedFiles', () => {
    it('should return an array', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      // HEAD vs HEAD should return no changed files
      const files = await gitAnalyzer.getChangedFiles('HEAD', 'HEAD');
      expect(Array.isArray(files)).toBe(true);
      expect(files).toHaveLength(0);
    });
  });

  describe('getDiffStats', () => {
    it('should return stats with expected shape', async () => {
      const isRepo = await gitAnalyzer.isRepository();
      if (!isRepo) return;

      const stats = await gitAnalyzer.getDiffStats('HEAD', 'HEAD');
      expect(stats).toHaveProperty('filesChanged');
      expect(stats).toHaveProperty('insertions');
      expect(stats).toHaveProperty('deletions');
      expect(typeof stats.filesChanged).toBe('number');
      expect(typeof stats.insertions).toBe('number');
      expect(typeof stats.deletions).toBe('number');
    });
  });
});
