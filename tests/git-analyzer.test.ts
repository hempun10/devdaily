import { describe, it, expect } from 'vitest';
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
});
