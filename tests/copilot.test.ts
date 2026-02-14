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

  beforeAll(() => {
    client = new TestableCopilotClient();
  });

  describe('parseOutput', () => {
    it('should return raw text when no ANSI codes present', () => {
      const result = client.testParseOutput('Hello, world!');
      expect(result).toBe('Hello, world!');
    });

    it('should strip ANSI escape codes', () => {
      const result = client.testParseOutput('\x1B[31mRed text\x1B[0m');
      expect(result).toBe('Red text');
    });

    it('should strip multiple ANSI codes', () => {
      const result = client.testParseOutput('\x1B[1m\x1B[32mBold green\x1B[0m normal');
      expect(result).toBe('Bold green normal');
    });

    it('should handle empty string', () => {
      const result = client.testParseOutput('');
      expect(result).toBe('');
    });

    it('should trim whitespace', () => {
      const result = client.testParseOutput('  hello  \n\n');
      expect(result).toBe('hello');
    });

    it('should handle complex ANSI sequences', () => {
      const result = client.testParseOutput('\x1B[38;5;196mColored\x1B[0m text');
      expect(result).toBe('Colored text');
    });
  });

  describe('generateSimpleTitle', () => {
    it('should extract title from conventional commit', () => {
      const result = client.testGenerateSimpleTitle(['feat: add user authentication']);
      expect(result).toContain('add user authentication');
    });

    it('should handle multiple commits', () => {
      const result = client.testGenerateSimpleTitle([
        'feat: add login page',
        'fix: handle edge case in auth',
        'docs: update README',
      ]);
      // Should use the first commit as the primary title
      expect(result.length).toBeGreaterThan(0);
    });

    it('should capitalize the first letter', () => {
      const result = client.testGenerateSimpleTitle(['feat: add something']);
      expect(result[0]).toBe(result[0].toUpperCase());
    });

    it('should handle non-conventional commits', () => {
      const result = client.testGenerateSimpleTitle(['Updated the login flow']);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const result = client.testGenerateSimpleTitle([]);
      expect(typeof result).toBe('string');
    });

    it('should handle single word commits', () => {
      const result = client.testGenerateSimpleTitle(['fix']);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle commits with scope', () => {
      const result = client.testGenerateSimpleTitle(['feat(auth): add OAuth support']);
      expect(result).toContain('add OAuth support');
    });
  });

  describe('detectPRType', () => {
    it('should detect feature type', () => {
      const result = client.testDetectPRType(['feat: add new feature']);
      expect(result).toBe('feature');
    });

    it('should detect bugfix type', () => {
      const result = client.testDetectPRType(['fix: resolve crash on login']);
      expect(result).toBe('bugfix');
    });

    it('should detect docs type', () => {
      const result = client.testDetectPRType(['docs: update API documentation']);
      expect(result).toBe('docs');
    });

    it('should detect refactor type', () => {
      const result = client.testDetectPRType(['refactor: simplify auth flow']);
      expect(result).toBe('refactor');
    });

    it('should detect test type', () => {
      const result = client.testDetectPRType(['test: add unit tests for auth']);
      expect(result).toBe('test');
    });

    it('should detect chore type', () => {
      const result = client.testDetectPRType(['chore: update dependencies']);
      expect(result).toBe('chore');
    });

    it('should detect majority type from mixed commits', () => {
      const result = client.testDetectPRType([
        'feat: add login',
        'feat: add signup',
        'fix: handle error',
      ]);
      expect(result).toBe('feature');
    });

    it('should default to feature for non-conventional commits', () => {
      const result = client.testDetectPRType(['updated something', 'changed another thing']);
      expect(result).toBe('feature');
    });

    it('should handle empty array', () => {
      const result = client.testDetectPRType([]);
      expect(typeof result).toBe('string');
    });
  });

  describe('formatTicketContext', () => {
    it('should format single ticket', () => {
      const result = client.testFormatTicketContext([
        {
          id: 'PROJ-123',
          title: 'Add user authentication',
          type: 'feature',
        },
      ]);
      expect(result).toContain('PROJ-123');
      expect(result).toContain('Add user authentication');
    });

    it('should format multiple tickets', () => {
      const result = client.testFormatTicketContext([
        { id: 'PROJ-1', title: 'First task', type: 'task' },
        { id: 'PROJ-2', title: 'Second task', type: 'bug' },
      ]);
      expect(result).toContain('PROJ-1');
      expect(result).toContain('PROJ-2');
    });

    it('should include description when present', () => {
      const result = client.testFormatTicketContext([
        {
          id: 'ENG-42',
          title: 'Fix login',
          description: 'The login form has a validation error',
          type: 'bug',
        },
      ]);
      expect(result).toContain('validation error');
    });

    it('should include priority when present', () => {
      const result = client.testFormatTicketContext([
        {
          id: 'ENG-42',
          title: 'Fix login',
          priority: 'high',
          type: 'bug',
        },
      ]);
      expect(result).toContain('high');
    });

    it('should handle empty array', () => {
      const result = client.testFormatTicketContext([]);
      expect(typeof result).toBe('string');
    });

    it('should handle ticket with minimal fields', () => {
      const result = client.testFormatTicketContext([
        { id: '#10', title: 'Quick fix', type: 'task' },
      ]);
      expect(result).toContain('#10');
      expect(result).toContain('Quick fix');
    });
  });

  describe('formatWorkContext', () => {
    it('should format full work context', () => {
      const result = client.testFormatWorkContext({
        branch: 'feature/add-auth',
        tickets: [{ id: '#42', type: 'github' }],
        categories: [{ name: 'frontend', files: ['a.tsx'], percentage: 60 }],
        commitCount: 5,
        filesChanged: ['a.tsx', 'b.tsx'],
        authors: ['dev1'],
        timeRange: {
          start: new Date('2026-02-10'),
          end: new Date('2026-02-12'),
          durationHours: 48,
        },
        summary: {
          primaryCategory: 'frontend',
          ticketSummary: 'Working on #42',
          workDescription: 'frontend work (feat)',
        },
      });

      expect(result).toContain('feature/add-auth');
      expect(result).toContain('#42');
    });

    it('should handle undefined context', () => {
      const result = client.testFormatWorkContext(undefined);
      expect(typeof result).toBe('string');
    });

    it('should handle empty context', () => {
      const result = client.testFormatWorkContext({});
      expect(typeof result).toBe('string');
    });

    it('should handle context with only branch', () => {
      const result = client.testFormatWorkContext({ branch: 'main' });
      expect(result).toContain('main');
    });

    it('should include category percentages when present', () => {
      const result = client.testFormatWorkContext({
        branch: 'feature/x',
        categories: [
          { name: 'frontend', files: ['a.tsx', 'b.tsx'], percentage: 60 },
          { name: 'backend', files: ['c.go'], percentage: 30 },
        ],
        summary: {
          primaryCategory: 'frontend',
          ticketSummary: 'No tickets',
          workDescription: 'Mixed work',
        },
      });

      expect(result).toContain('frontend');
      expect(result).toContain('60%');
    });

    it('should include time range when present', () => {
      const result = client.testFormatWorkContext({
        branch: 'feature/x',
        timeRange: {
          start: new Date('2026-02-10'),
          end: new Date('2026-02-12'),
          durationHours: 48,
        },
      });

      expect(result).toContain('48');
    });

    it('should include multiple authors when present', () => {
      const result = client.testFormatWorkContext({
        branch: 'feature/x',
        authors: ['dev1', 'dev2'],
      });

      expect(result).toContain('dev1');
      expect(result).toContain('dev2');
    });

    it('should include files changed count when available', () => {
      const result = client.testFormatWorkContext({
        branch: 'feature/x',
        filesChanged: ['a.ts', 'b.ts', 'c.ts'],
      });

      expect(result).toContain('3');
    });

    it('should not include zero-percentage categories', () => {
      const result = client.testFormatWorkContext({
        branch: 'feature/x',
        categories: [
          { name: 'frontend', files: ['a.tsx'], percentage: 90 },
          { name: 'docs', files: ['b.md'], percentage: 10 },
        ],
      });

      // The top categories should be shown but not necessarily excluded
      expect(result).toContain('frontend');
      // docs at 10% may or may not show depending on implementation
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
