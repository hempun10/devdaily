import { describe, it, expect } from 'vitest';
import { CopilotClient } from '../src/core/copilot.js';

/**
 * Tests for CopilotClient helper methods.
 *
 * Note: We can't test methods that actually call the Copilot CLI
 * (suggest, explain, summarizeCommits, etc.) without mocking execa,
 * so we focus on the pure logic helpers that are accessible.
 *
 * We use a subclass to expose private methods for testing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private methods for unit testing
type AnyAccess = any;

class TestableCopilotClient extends CopilotClient {
  public testParseOutput(raw: string): string {
    return (this as AnyAccess).parseOutput(raw);
  }

  public testGenerateSimpleTitle(commits: string[]): string {
    return (this as AnyAccess).generateSimpleTitle(commits);
  }

  public testDetectPRType(commits: string[]): string {
    return (this as AnyAccess).detectPRType(commits);
  }

  public testFormatTicketContext(
    tickets: Array<{
      id: string;
      title: string;
      description?: string;
      priority?: string;
      type: string;
    }>
  ): string {
    return (this as AnyAccess).formatTicketContext(tickets);
  }

  public testFormatWorkContext(context?: Record<string, unknown>): string {
    return (this as AnyAccess).formatWorkContext(context);
  }
}

describe('CopilotClient', () => {
  let client: TestableCopilotClient;

  beforeEach(() => {
    client = new TestableCopilotClient();
  });

  describe('parseOutput', () => {
    it('should strip ANSI escape codes', () => {
      const raw = '\x1B[32mHello\x1B[0m \x1B[1mWorld\x1B[0m';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Hello World');
    });

    it('should filter out Suggestion: lines', () => {
      const raw = 'Suggestion: do something\nActual content here';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Actual content here');
      expect(result).not.toContain('Suggestion:');
    });

    it('should filter out Session/Model/Duration metadata lines', () => {
      const raw = 'Session: abc123\nModel: gpt-4\nDuration: 2.5s\nThe actual response';
      const result = client.testParseOutput(raw);

      expect(result).toBe('The actual response');
    });

    it('should filter out Explain command: lines', () => {
      const raw = 'Explain command: something\nHere is the explanation';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Here is the explanation');
    });

    it('should filter out lines containing only ?', () => {
      const raw = 'Line one\n?\nLine two';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Line one\nLine two');
    });

    it('should trim whitespace and empty lines', () => {
      const raw = '\n\n  Content here  \n\n';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Content here');
    });

    it('should handle empty input', () => {
      const result = client.testParseOutput('');
      expect(result).toBe('');
    });

    it('should handle multiline content', () => {
      const raw = 'Line 1\nLine 2\nLine 3';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should strip complex ANSI sequences', () => {
      const raw = '\x1B[38;5;42mColored text\x1B[0m';
      const result = client.testParseOutput(raw);

      expect(result).toBe('Colored text');
    });
  });

  describe('generateSimpleTitle', () => {
    it('should generate title from conventional commit', () => {
      const title = client.testGenerateSimpleTitle(['feat: add user authentication']);

      expect(title).toBe('feat: add user authentication');
    });

    it('should use first commit as title', () => {
      const title = client.testGenerateSimpleTitle([
        'fix(auth): resolve login bug',
        'test: add auth tests',
        'docs: update README',
      ]);

      expect(title).toBe('fix: resolve login bug');
    });

    it('should truncate long commit messages to 60 characters', () => {
      const longMessage =
        'This is a very long commit message that exceeds the sixty character limit for titles';
      const title = client.testGenerateSimpleTitle([longMessage]);

      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('...');
    });

    it('should return "Update" for empty commits array', () => {
      const title = client.testGenerateSimpleTitle([]);

      expect(title).toBe('Update');
    });

    it('should handle non-conventional commit messages', () => {
      const title = client.testGenerateSimpleTitle(['Fixed the thing']);

      expect(title).toBe('Fixed the thing');
    });

    it('should extract type and message from scoped commits', () => {
      const title = client.testGenerateSimpleTitle(['feat(ui): add dark mode toggle']);

      expect(title).toBe('feat: add dark mode toggle');
    });

    it('should not truncate messages at exactly 60 characters', () => {
      const exact60 = 'a'.repeat(60);
      const title = client.testGenerateSimpleTitle([exact60]);

      expect(title).toBe(exact60);
      expect(title).not.toContain('...');
    });
  });

  describe('detectPRType', () => {
    it('should detect feat as primary type', () => {
      const type = client.testDetectPRType(['feat: add new feature', 'feat: another feature']);

      expect(type).toBe('feat');
    });

    it('should detect fix as primary type', () => {
      const type = client.testDetectPRType([
        'fix: resolve bug',
        'fix: another fix',
        'test: add tests',
      ]);

      expect(type).toBe('fix');
    });

    it('should return most common type', () => {
      const type = client.testDetectPRType([
        'docs: update readme',
        'docs: add contributing guide',
        'docs: update changelog',
        'feat: add feature',
      ]);

      expect(type).toBe('docs');
    });

    it('should default to chore for non-conventional commits', () => {
      const type = client.testDetectPRType(['random commit', 'another random commit']);

      expect(type).toBe('chore');
    });

    it('should handle scoped commits', () => {
      const type = client.testDetectPRType([
        'refactor(core): simplify logic',
        'refactor(ui): cleanup styles',
      ]);

      expect(type).toBe('refactor');
    });

    it('should handle mixed conventional and non-conventional commits', () => {
      const type = client.testDetectPRType([
        'feat: add login',
        'WIP',
        'feat: add signup',
        'cleanup',
      ]);

      expect(type).toBe('feat');
    });

    it('should handle single commit', () => {
      const type = client.testDetectPRType(['test: add unit tests']);

      expect(type).toBe('test');
    });
  });

  describe('formatTicketContext', () => {
    it('should return empty string for no tickets', () => {
      const result = client.testFormatTicketContext([]);

      expect(result).toBe('');
    });

    it('should format a single ticket with all fields', () => {
      const result = client.testFormatTicketContext([
        {
          id: 'PROJ-123',
          title: 'Fix login page',
          description: 'The login page crashes on mobile',
          priority: 'high',
          type: 'bug',
        },
      ]);

      expect(result).toContain('PROJ-123');
      expect(result).toContain('Fix login page');
      expect(result).toContain('bug');
      expect(result).toContain('high');
      expect(result).toContain('login page crashes');
    });

    it('should format multiple tickets', () => {
      const result = client.testFormatTicketContext([
        { id: 'PROJ-1', title: 'Feature A', type: 'feature' },
        { id: 'PROJ-2', title: 'Bug B', type: 'bug' },
      ]);

      expect(result).toContain('PROJ-1');
      expect(result).toContain('PROJ-2');
      expect(result).toContain('Feature A');
      expect(result).toContain('Bug B');
    });

    it('should handle tickets with no description', () => {
      const result = client.testFormatTicketContext([
        { id: 'PROJ-1', title: 'No desc ticket', type: 'task' },
      ]);

      expect(result).toContain('No description');
    });

    it('should truncate long descriptions to 200 characters', () => {
      const longDesc = 'A'.repeat(500);
      const result = client.testFormatTicketContext([
        { id: 'PROJ-1', title: 'Long desc', description: longDesc, type: 'feature' },
      ]);

      // The description in the output should be at most 200 characters
      expect(result).toContain('PROJ-1');
      expect(result).not.toContain('A'.repeat(201));
    });

    it('should handle tickets without priority', () => {
      const result = client.testFormatTicketContext([
        { id: 'PROJ-1', title: 'No priority', type: 'task' },
      ]);

      expect(result).toContain('PROJ-1');
      expect(result).toContain('task');
      // Should not contain priority in parens
      expect(result).not.toContain('(undefined)');
    });
  });

  describe('formatWorkContext', () => {
    it('should return empty string for undefined context', () => {
      const result = client.testFormatWorkContext(undefined);

      expect(result).toBe('');
    });

    it('should format context with tickets', () => {
      const result = client.testFormatWorkContext({
        tickets: [{ id: 'PROJ-1' }, { id: 'PROJ-2' }],
        categories: [],
        filesChanged: ['a.ts'],
        branch: 'feature/test',
      });

      expect(result).toContain('PROJ-1, PROJ-2');
      expect(result).toContain('feature/test');
    });

    it('should format context with categories', () => {
      const result = client.testFormatWorkContext({
        tickets: [],
        categories: [
          { name: 'frontend', percentage: 60 },
          { name: 'backend', percentage: 30 },
          { name: 'tests', percentage: 10 },
        ],
        filesChanged: ['a.ts', 'b.ts'],
        branch: 'main',
      });

      expect(result).toContain('frontend (60%)');
      expect(result).toContain('backend (30%)');
      expect(result).toContain('tests (10%)');
    });

    it('should include file count', () => {
      const result = client.testFormatWorkContext({
        tickets: [],
        categories: [],
        filesChanged: ['a.ts', 'b.ts', 'c.ts'],
        branch: 'develop',
      });

      expect(result).toContain('Files changed: 3');
    });

    it('should include branch name', () => {
      const result = client.testFormatWorkContext({
        tickets: [],
        categories: [],
        filesChanged: [],
        branch: 'feature/my-feature',
      });

      expect(result).toContain('feature/my-feature');
    });

    it('should limit categories to top 3', () => {
      const result = client.testFormatWorkContext({
        tickets: [],
        categories: [
          { name: 'frontend', percentage: 40 },
          { name: 'backend', percentage: 30 },
          { name: 'tests', percentage: 20 },
          { name: 'docs', percentage: 10 },
        ],
        filesChanged: [],
        branch: 'main',
      });

      expect(result).toContain('frontend');
      expect(result).toContain('backend');
      expect(result).toContain('tests');
      expect(result).not.toContain('docs (10%)');
    });
  });

  describe('copilotTypeCache', () => {
    it('should have undefined cache initially', () => {
      // Access private property through any cast for testing
      expect((client as AnyAccess).copilotTypeCache).toBeUndefined();
    });
  });
});
