import { describe, it, expect } from 'vitest';
import {
  parseConventionalCommit,
  extractIssueNumbers,
  generatePRTitle,
  categorizePRType,
} from '../src/utils/commitlint.js';

describe('Commitlint Utils', () => {
  describe('parseConventionalCommit', () => {
    it('should parse feat commit', () => {
      const result = parseConventionalCommit('feat: add new feature');
      expect(result).toEqual({
        type: 'feat',
        scope: undefined,
        subject: 'add new feature',
        breaking: false,
      });
    });

    it('should parse fix commit with scope', () => {
      const result = parseConventionalCommit('fix(auth): resolve login bug');
      expect(result).toEqual({
        type: 'fix',
        scope: 'auth',
        subject: 'resolve login bug',
        breaking: false,
      });
    });

    it('should return null for non-conventional commit', () => {
      const result = parseConventionalCommit('random commit message');
      expect(result).toBeNull();
    });
  });

  describe('extractIssueNumbers', () => {
    it('should extract issue numbers', () => {
      const issues = extractIssueNumbers('fix: resolve #123 and #456');
      expect(issues).toEqual(['#123', '#456']);
    });
  });

  describe('generatePRTitle', () => {
    it('should generate title from conventional commit', () => {
      const title = generatePRTitle(['feat: add OAuth integration']);
      expect(title).toBe('add OAuth integration');
    });
  });

  describe('categorizePRType', () => {
    it('should categorize as feature', () => {
      const type = categorizePRType(['feat: add feature']);
      expect(type).toBe('feature');
    });
  });
});
