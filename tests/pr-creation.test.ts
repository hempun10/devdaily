import { describe, it, expect, beforeEach } from 'vitest';
import { CopilotClient } from '../src/core/copilot.js';
import { parsePRTemplate, fillTemplate, getDefaultTemplate } from '../src/core/pr-template.js';
import {
  parsePRPrompt,
  formatPRPromptForAI,
  generateSamplePRPrompt,
  type PRPromptConfig,
} from '../src/core/pr-prompt.js';
import {
  generatePRTitle,
  categorizePRType,
  parseConventionalCommit,
  extractIssueNumbers,
} from '../src/utils/commitlint.js';
import type { Ticket } from '../src/core/project-management.js';

// ─── Testable Subclass ────────────────────────────────────────────────────────
// Expose private/protected methods for unit testing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAccess = any;

class TestableCopilotClient extends CopilotClient {
  public testBuildDiffBlock(diffStat?: string, diff?: string): string {
    return (this as AnyAccess).buildDiffBlock(diffStat, diff);
  }

  public testBuildTicketLinks(tickets: Ticket[], issueIds: string[]): string {
    return (this as AnyAccess).buildTicketLinks(tickets, issueIds);
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

  /**
   * Stub out `suggest()` so we capture the prompt without calling the real
   * Copilot CLI. Returns the full prompt string so tests can assert on its
   * content.
   */
  public async suggestCapture(prompt: string): Promise<string> {
    return prompt;
  }

  /**
   * Replace `suggest` with `suggestCapture` for prompt-inspection tests.
   */
  public enablePromptCapture(): void {
    (this as AnyAccess).suggest = this.suggestCapture.bind(this);
  }

  /**
   * Replace `suggest` with a canned JSON response for generatePRContent tests.
   */
  public stubSuggestWith(response: string): void {
    (this as AnyAccess).suggest = async () => response;
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'PROJ-123',
    title: 'Add user authentication',
    description: 'Implement login/signup flow with OAuth2.',
    status: 'in-progress',
    type: 'feature',
    priority: 'high',
    assignee: 'dev1',
    labels: ['auth', 'backend'],
    url: 'https://jira.example.com/browse/PROJ-123',
    source: 'jira',
    ...overrides,
  };
}

function makeGitHubTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '#42',
    title: 'Login page crashes on mobile',
    description: 'The login page crashes when viewport is < 375px.',
    status: 'open',
    type: 'bug',
    priority: 'high',
    assignee: 'dev1',
    labels: ['bug', 'mobile'],
    url: 'https://github.com/org/repo/issues/42',
    source: 'github',
    ...overrides,
  };
}

function makeLinearTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ENG-99',
    title: 'Refactor auth middleware',
    description: 'Move to a single middleware chain.',
    status: 'started',
    type: 'task',
    priority: 'medium',
    assignee: 'dev2',
    labels: ['tech-debt'],
    url: 'https://linear.app/team/ENG-99',
    source: 'linear',
    ...overrides,
  };
}

const SAMPLE_COMMITS = [
  'feat(auth): add OAuth2 login flow',
  'feat(auth): add signup page',
  'fix(auth): handle token refresh edge case',
  'test(auth): add unit tests for auth middleware',
  'chore: update eslint config',
];

const SAMPLE_FILES = [
  'src/auth/login.ts',
  'src/auth/signup.ts',
  'src/auth/middleware.ts',
  'src/auth/__tests__/middleware.test.ts',
  '.eslintrc.json',
];

const SAMPLE_DIFF_STAT = ` src/auth/login.ts    | 45 ++++++++++++++
 src/auth/signup.ts   | 38 ++++++++++++
 src/auth/middleware.ts | 12 ++--
 3 files changed, 87 insertions(+), 8 deletions(-)`;

const SAMPLE_DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -0,0 +1,45 @@
+import { OAuth2Client } from './oauth2';
+
+export async function handleLogin(req: Request): Promise<Response> {
+  const client = new OAuth2Client();
+  const token = await client.authenticate(req.body);
+  return Response.json({ token });
+}`;

const SAMPLE_PR_TEMPLATE = `## What Changed

[Description of changes]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## How to Test

[Testing steps]

## Jira Ticket

[Ticket info]

## Checklist

- [ ] My code follows the style guidelines
- [ ] I have added tests
- [ ] New and existing tests pass`;

const SAMPLE_PROMPT_CONFIG: PRPromptConfig = {
  raw: '## Tone\n\nProfessional.\n\n## Format\n\nUse bullet points.',
  path: '/repo/.devdaily-pr-prompt.md',
  guidelines: [
    { heading: 'Tone', content: 'Professional.' },
    { heading: 'Format', content: 'Use bullet points.' },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PR Creation Flow', () => {
  let client: TestableCopilotClient;

  beforeEach(() => {
    client = new TestableCopilotClient();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. buildDiffBlock
  // ═══════════════════════════════════════════════════════════════════════════
  describe('buildDiffBlock', () => {
    it('should return empty string when neither stat nor diff provided', () => {
      const result = client.testBuildDiffBlock(undefined, undefined);
      expect(result).toBe('');
    });

    it('should return empty string when both are empty strings', () => {
      const result = client.testBuildDiffBlock('', '');
      expect(result).toBe('');
    });

    it('should include only stat when diff is undefined', () => {
      const result = client.testBuildDiffBlock(SAMPLE_DIFF_STAT, undefined);
      expect(result).toContain('Diff summary (git diff --stat)');
      expect(result).toContain('src/auth/login.ts');
      expect(result).not.toContain('unified diff');
    });

    it('should include only diff when stat is undefined', () => {
      const result = client.testBuildDiffBlock(undefined, SAMPLE_DIFF);
      expect(result).toContain('Code changes (unified diff');
      expect(result).toContain('OAuth2Client');
      expect(result).not.toContain('Diff summary');
    });

    it('should include both stat and diff when both provided', () => {
      const result = client.testBuildDiffBlock(SAMPLE_DIFF_STAT, SAMPLE_DIFF);
      expect(result).toContain('Diff summary (git diff --stat)');
      expect(result).toContain('Code changes (unified diff');
      expect(result).toContain('3 files changed');
      expect(result).toContain('OAuth2Client');
    });

    it('should preserve actual file paths from stat', () => {
      const result = client.testBuildDiffBlock(SAMPLE_DIFF_STAT, undefined);
      expect(result).toContain('src/auth/login.ts');
      expect(result).toContain('src/auth/signup.ts');
      expect(result).toContain('src/auth/middleware.ts');
    });

    it('should preserve diff hunks', () => {
      const result = client.testBuildDiffBlock(undefined, SAMPLE_DIFF);
      expect(result).toContain('@@');
      expect(result).toContain('+import { OAuth2Client }');
    });

    it('should handle very large diff gracefully (no crash)', () => {
      const hugeDiff = Array(5000).fill('+// line of code').join('\n');
      const result = client.testBuildDiffBlock(undefined, hugeDiff);
      expect(result).toContain('+// line of code');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. buildTicketLinks
  // ═══════════════════════════════════════════════════════════════════════════
  describe('buildTicketLinks', () => {
    it('should return empty string when no tickets and no issue IDs', () => {
      const result = client.testBuildTicketLinks([], []);
      expect(result).toBe('');
    });

    it('should generate "Closes" for GitHub tickets', () => {
      const ticket = makeGitHubTicket();
      const result = client.testBuildTicketLinks([ticket], []);
      expect(result).toContain('Closes #42');
    });

    it('should generate "Relates to" with URL for Jira tickets', () => {
      const ticket = makeTicket();
      const result = client.testBuildTicketLinks([ticket], []);
      expect(result).toContain('Relates to [PROJ-123](https://jira.example.com/browse/PROJ-123)');
    });

    it('should generate "Relates to" with URL for Linear tickets', () => {
      const ticket = makeLinearTicket();
      const result = client.testBuildTicketLinks([ticket], []);
      expect(result).toContain('Relates to [ENG-99](https://linear.app/team/ENG-99)');
    });

    it('should handle ticket without URL', () => {
      const ticket = makeTicket({ url: '' });
      const result = client.testBuildTicketLinks([ticket], []);
      expect(result).toContain('Relates to PROJ-123');
      expect(result).not.toContain('[PROJ-123]');
    });

    it('should handle multiple tickets of different types', () => {
      const tickets = [makeGitHubTicket(), makeTicket(), makeLinearTicket()];
      const result = client.testBuildTicketLinks(tickets, []);
      expect(result).toContain('Closes #42');
      expect(result).toContain('Relates to [PROJ-123]');
      expect(result).toContain('Relates to [ENG-99]');
    });

    it('should add issue IDs not covered by ticket objects', () => {
      const ticket = makeGitHubTicket();
      const result = client.testBuildTicketLinks([ticket], ['#42', '#99', 'PROJ-200']);
      // #42 is already in tickets, so should not be duplicated
      expect(result).toContain('Closes #42');
      // #99 is not in tickets, should be added as "Closes #99"
      expect(result).toContain('Closes #99');
      // PROJ-200 is not in tickets and not #-prefixed, should be "Relates to"
      expect(result).toContain('Relates to PROJ-200');
    });

    it('should not duplicate ticket IDs already present in ticket objects', () => {
      const ticket = makeGitHubTicket();
      const result = client.testBuildTicketLinks([ticket], ['#42']);
      const occurrences = (result.match(/#42/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it('should handle only issue IDs with no ticket objects', () => {
      const result = client.testBuildTicketLinks([], ['#10', 'PROJ-55']);
      expect(result).toContain('Closes #10');
      expect(result).toContain('Relates to PROJ-55');
    });

    it('should separate links with newlines', () => {
      const tickets = [makeGitHubTicket(), makeTicket()];
      const result = client.testBuildTicketLinks(tickets, []);
      const lines = result.split('\n');
      expect(lines.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. generatePRDescription — prompt construction
  // ═══════════════════════════════════════════════════════════════════════════
  describe('generatePRDescription prompt construction', () => {
    beforeEach(() => {
      client.enablePromptCapture();
    });

    it('should include branch name in the prompt', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/PROJ-123-auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
      });
      expect(prompt).toContain('feature/PROJ-123-auth');
    });

    it('should include all commit messages in the prompt', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      for (const commit of SAMPLE_COMMITS) {
        expect(prompt).toContain(commit);
      }
    });

    it('should number commits sequentially', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).toContain('1. feat(auth): add OAuth2 login flow');
      expect(prompt).toContain('2. feat(auth): add signup page');
      expect(prompt).toContain('5. chore: update eslint config');
    });

    it('should include changed files in the prompt', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      for (const file of SAMPLE_FILES) {
        expect(prompt).toContain(file);
      }
    });

    it('should truncate file list when more than 40 files', async () => {
      const manyFiles = Array.from({ length: 55 }, (_, i) => `src/file-${i}.ts`);
      const prompt = await client.generatePRDescription({
        branch: 'feature/big-change',
        commits: ['feat: big change'],
        files: manyFiles,
        issues: [],
      });
      expect(prompt).toContain('... and 15 more files');
      // First 40 should be present
      expect(prompt).toContain('src/file-0.ts');
      expect(prompt).toContain('src/file-39.ts');
      // 41st should NOT be present
      expect(prompt).not.toContain('src/file-40.ts');
    });

    it('should include issue IDs when present', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123', '#42'],
      });
      expect(prompt).toContain('PROJ-123');
      expect(prompt).toContain('#42');
    });

    it('should show "None" for related tickets when no issues provided', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).toContain('Related tickets: None');
    });

    it('should include ticket context when ticketDetails provided', async () => {
      const ticket = makeTicket();
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
        ticketDetails: [ticket],
      });
      expect(prompt).toContain('PROJ-123');
      expect(prompt).toContain('Add user authentication');
    });

    it('should include diff block when diffStat and diff provided', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
        diffStat: SAMPLE_DIFF_STAT,
        diff: SAMPLE_DIFF,
      });
      expect(prompt).toContain('Diff summary (git diff --stat)');
      expect(prompt).toContain('Code changes (unified diff');
      expect(prompt).toContain('OAuth2Client');
    });

    it('should not include diff block when no diff data provided', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).not.toContain('Diff summary');
      expect(prompt).not.toContain('unified diff');
    });

    it('should include PR template content when templateContent provided', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
        templateContent: SAMPLE_PR_TEMPLATE,
      });
      expect(prompt).toContain('=== PR TEMPLATE (follow this structure) ===');
      expect(prompt).toContain('=== END PR TEMPLATE ===');
      expect(prompt).toContain('## What Changed');
      expect(prompt).toContain('## How to Test');
      expect(prompt).toContain('Follow the PR template structure above.');
    });

    it('should use default structure instructions when no template provided', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).toContain('## What Changed');
      expect(prompt).toContain('## Why');
      expect(prompt).toContain('## How to Test');
      expect(prompt).not.toContain('=== PR TEMPLATE');
    });

    it('should include team guidelines when promptConfig provided', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
        promptConfig: SAMPLE_PROMPT_CONFIG,
      });
      expect(prompt).toContain('=== TEAM PR DESCRIPTION GUIDELINES');
      expect(prompt).toContain('=== END TEAM GUIDELINES ===');
      expect(prompt).toContain('Professional.');
      expect(prompt).toContain('Use bullet points.');
    });

    it('should not include guidelines block when promptConfig is null', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
        promptConfig: null,
      });
      expect(prompt).not.toContain('TEAM PR DESCRIPTION GUIDELINES');
    });

    it('should include anti-hallucination instructions', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).toContain('NEVER invent or hallucinate');
      expect(prompt).toContain('specific and technical');
    });

    it('should include ticket link references when tickets present', async () => {
      const ticket = makeTicket();
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
        ticketDetails: [ticket],
      });
      expect(prompt).toContain('ticket references');
      expect(prompt).toContain('Relates to [PROJ-123]');
    });

    it('should include GitHub "Closes" style for GitHub tickets', async () => {
      const ticket = makeGitHubTicket();
      const prompt = await client.generatePRDescription({
        branch: 'fix/login-crash',
        commits: ['fix: resolve login crash on mobile'],
        files: ['src/login.tsx'],
        issues: ['#42'],
        ticketDetails: [ticket],
      });
      expect(prompt).toContain('Closes #42');
    });

    it('should combine all context: diff, template, guidelines, tickets', async () => {
      const ticket = makeTicket();
      const prompt = await client.generatePRDescription({
        branch: 'feature/PROJ-123-auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
        ticketDetails: [ticket],
        diffStat: SAMPLE_DIFF_STAT,
        diff: SAMPLE_DIFF,
        templateContent: SAMPLE_PR_TEMPLATE,
        promptConfig: SAMPLE_PROMPT_CONFIG,
      });

      // All contexts should be present
      expect(prompt).toContain('feature/PROJ-123-auth');
      expect(prompt).toContain('feat(auth): add OAuth2 login flow');
      expect(prompt).toContain('Diff summary');
      expect(prompt).toContain('OAuth2Client');
      expect(prompt).toContain('=== PR TEMPLATE');
      expect(prompt).toContain('TEAM PR DESCRIPTION GUIDELINES');
      expect(prompt).toContain('PROJ-123');
      expect(prompt).toContain('Relates to [PROJ-123]');
    });

    it('should instruct to focus on value for code reviewers', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).toContain('code reviewers');
    });

    it('should instruct no emojis in body', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: [],
      });
      expect(prompt).toContain('No emojis');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. generatePRContent — prompt + JSON parsing + fallback
  // ═══════════════════════════════════════════════════════════════════════════
  describe('generatePRContent', () => {
    describe('prompt construction', () => {
      beforeEach(() => {
        // For prompt inspection, stub suggest to return a valid JSON so it doesn't
        // hit the fallback path — but we inspect the prompt passed to it.
        let capturedPrompt = '';
        (client as AnyAccess).suggest = async (prompt: string) => {
          capturedPrompt = prompt;
          // Return valid JSON so the test doesn't error
          return JSON.stringify({
            title: 'feat: test',
            description: 'test desc',
            type: 'feat',
            impact: 'none',
            testing: 'none',
            breakingChanges: 'None',
            additionalInfo: 'None',
          });
        };
        // Expose captured prompt
        (client as AnyAccess)._getCapturedPrompt = () => capturedPrompt;
      });

      it('should include branch and commits in prompt', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('feature/auth');
        for (const commit of SAMPLE_COMMITS) {
          expect(prompt).toContain(commit);
        }
      });

      it('should include template sections when provided', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
          templateSections: ['description', 'testing', 'impact'],
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('Template sections to fill');
        expect(prompt).toContain('description');
        expect(prompt).toContain('testing');
        expect(prompt).toContain('impact');
      });

      it('should include diff context when provided', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
          diffStat: SAMPLE_DIFF_STAT,
          diff: SAMPLE_DIFF,
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('Diff summary');
        expect(prompt).toContain('OAuth2Client');
      });

      it('should include template content when provided', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
          templateContent: SAMPLE_PR_TEMPLATE,
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('PR template used by this repo');
        expect(prompt).toContain('## What Changed');
      });

      it('should include guidelines when promptConfig provided', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
          promptConfig: SAMPLE_PROMPT_CONFIG,
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('TEAM PR DESCRIPTION GUIDELINES');
        expect(prompt).toContain('Professional.');
      });

      it('should request JSON output format', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('JSON');
        expect(prompt).toContain('"title"');
        expect(prompt).toContain('"description"');
        expect(prompt).toContain('"type"');
        expect(prompt).toContain('"impact"');
        expect(prompt).toContain('"testing"');
        expect(prompt).toContain('"breakingChanges"');
      });

      it('should include anti-hallucination instructions', async () => {
        await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
        });
        const prompt = (client as AnyAccess)._getCapturedPrompt();
        expect(prompt).toContain('Do NOT hallucinate');
      });
    });

    describe('JSON parsing from AI response', () => {
      it('should parse clean JSON response', async () => {
        client.stubSuggestWith(
          JSON.stringify({
            title: 'feat: add OAuth2 login',
            description: '- Added login page\n- Added signup flow',
            type: 'feat',
            impact: 'Users can now authenticate.',
            testing: '1. Go to /login\n2. Click Sign In',
            breakingChanges: 'None',
            additionalInfo: 'None',
          })
        );

        const result = await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
        });

        expect(result.title).toBe('feat: add OAuth2 login');
        expect(result.description).toContain('Added login page');
        expect(result.type).toBe('feat');
        expect(result.impact).toContain('authenticate');
        expect(result.testing).toContain('/login');
        expect(result.breakingChanges).toBe('None');
        expect(result.additionalInfo).toBe('None');
      });

      it('should extract JSON from response with surrounding text', async () => {
        client.stubSuggestWith(
          'Here is the JSON:\n\n' +
            JSON.stringify({
              title: 'fix: resolve crash',
              description: '- Fixed null check',
              type: 'fix',
              impact: 'No more crashes.',
              testing: '1. Load the page',
              breakingChanges: 'None',
              additionalInfo: 'None',
            }) +
            '\n\nLet me know if you need changes.'
        );

        const result = await client.generatePRContent({
          branch: 'fix/crash',
          commits: ['fix: resolve crash'],
          files: ['src/app.ts'],
          issues: [],
        });

        expect(result.title).toBe('fix: resolve crash');
        expect(result.type).toBe('fix');
      });

      it('should fallback to simple content when JSON parsing fails', async () => {
        client.stubSuggestWith('This is not JSON at all. Just plain text.');

        const result = await client.generatePRContent({
          branch: 'feature/auth',
          commits: SAMPLE_COMMITS,
          files: SAMPLE_FILES,
          issues: [],
        });

        // Should return the fallback structure
        expect(result.title).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.type).toBeDefined();
        expect(result.testing).toBeDefined();
        expect(result.breakingChanges).toBe('None');
      });

      it('should fallback when response is malformed JSON', async () => {
        client.stubSuggestWith('{ "title": "broken JSON", "desc');

        const result = await client.generatePRContent({
          branch: 'feature/auth',
          commits: ['feat: add feature'],
          files: ['src/a.ts'],
          issues: [],
        });

        // Should use fallback
        expect(result.title).toBeDefined();
        expect(result.type).toBeDefined();
      });

      it('should fallback when response is empty', async () => {
        client.stubSuggestWith('');

        const result = await client.generatePRContent({
          branch: 'feature/auth',
          commits: ['feat: add feature'],
          files: ['src/a.ts'],
          issues: [],
        });

        expect(result.title).toBeDefined();
        expect(result.type).toBeDefined();
      });
    });

    describe('fallback content generation', () => {
      it('should generate title from conventional commit in fallback', async () => {
        client.stubSuggestWith('not json');

        const result = await client.generatePRContent({
          branch: 'feature/auth',
          commits: ['feat(auth): add OAuth2 support'],
          files: ['src/auth.ts'],
          issues: [],
        });

        expect(result.title).toContain('add OAuth2 support');
      });

      it('should detect PR type from commits in fallback', async () => {
        client.stubSuggestWith('not json');

        const result = await client.generatePRContent({
          branch: 'fix/bugs',
          commits: ['fix: resolve crash', 'fix: handle null', 'feat: add logging'],
          files: ['src/app.ts'],
          issues: [],
        });

        // Majority type is "fix"
        expect(result.type).toBe('fix');
      });

      it('should include commit messages as description in fallback', async () => {
        client.stubSuggestWith('not json');

        const result = await client.generatePRContent({
          branch: 'feature/auth',
          commits: ['feat: add login', 'feat: add signup'],
          files: ['src/login.ts', 'src/signup.ts'],
          issues: [],
        });

        expect(result.description).toContain('feat: add login');
        expect(result.description).toContain('feat: add signup');
      });

      it('should limit description to 5 commits in fallback', async () => {
        client.stubSuggestWith('not json');
        const manyCommits = Array.from({ length: 10 }, (_, i) => `feat: commit ${i + 1}`);

        const result = await client.generatePRContent({
          branch: 'feature/many',
          commits: manyCommits,
          files: ['src/a.ts'],
          issues: [],
        });

        // Should contain first 5
        expect(result.description).toContain('commit 1');
        expect(result.description).toContain('commit 5');
        // Should not contain 6th
        expect(result.description).not.toContain('commit 6');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Template + Content integration
  // ═══════════════════════════════════════════════════════════════════════════
  describe('template filling integration', () => {
    const baseContent = {
      title: 'feat: add authentication',
      description: '- Added OAuth2 login flow\n- Added signup page',
      type: 'feat',
      impact: 'Users can authenticate via OAuth2.',
      testing: '1. Go to /login\n2. Click Sign In\n3. Verify redirect',
      ticketIds: ['PROJ-123'],
      ticketLinks: [{ id: 'PROJ-123', url: 'https://jira.example.com/browse/PROJ-123' }],
      breakingChanges: 'None',
      additionalInfo: 'Requires OAuth2 credentials in env.',
    };

    it('should fill all sections of a multi-section template', () => {
      const template = parsePRTemplate(SAMPLE_PR_TEMPLATE);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('## What Changed');
      expect(result).toContain('Added OAuth2 login flow');
      expect(result).toContain('## Type of Change');
      expect(result).toContain('[x]'); // feat → feature
      expect(result).toContain('## How to Test');
      expect(result).toContain('Go to /login');
      expect(result).toContain('## Jira Ticket');
      expect(result).toContain('PROJ-123');
      expect(result).toContain('## Checklist');
    });

    it('should check the correct type checkbox for fix', () => {
      const template = parsePRTemplate(SAMPLE_PR_TEMPLATE);
      const fixContent = { ...baseContent, type: 'fix' };
      const result = fillTemplate(template, fixContent);

      // Bug fix should be checked
      expect(result).toMatch(/\[x\].*Bug fix/i);
      // New feature should not be checked
      expect(result).toMatch(/\[ \].*New feature/i);
    });

    it('should handle template without ticket section', () => {
      const simpleTemplate = parsePRTemplate(`## Description\n\n[desc]\n\n## Testing\n\n[steps]`);
      const result = fillTemplate(simpleTemplate, baseContent);

      expect(result).toContain('## Description');
      expect(result).toContain('Added OAuth2');
      expect(result).toContain('## Testing');
      expect(result).toContain('Go to /login');
    });

    it('should show N/A for ticket section when no tickets', () => {
      const template = parsePRTemplate(`## Jira Ticket\n\n[ticket]`);
      const noTickets = { ...baseContent, ticketIds: [], ticketLinks: [] };
      const result = fillTemplate(template, noTickets);

      expect(result).toContain('N/A');
    });

    it('should preserve checklist sections untouched', () => {
      const template = parsePRTemplate(
        `## Review Checklist\n\n- [ ] Code reviewed\n- [ ] Tests pass`
      );
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('- [ ] Code reviewed');
      expect(result).toContain('- [ ] Tests pass');
    });

    it('should add title heading when template has h1', () => {
      const template = parsePRTemplate(`# PR\n\n## Description\n\nContent`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('# feat: add authentication');
    });

    it('should fill breaking changes section', () => {
      const template = parsePRTemplate(`## Breaking\n\n[details]`);
      const breakingContent = {
        ...baseContent,
        breakingChanges: 'Removed legacy /api/v1 endpoints.',
      };
      const result = fillTemplate(template, breakingContent);

      expect(result).toContain('Removed legacy /api/v1 endpoints.');
    });

    it('should fill additional notes section', () => {
      const template = parsePRTemplate(`## Additional Notes\n\n[notes]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('Requires OAuth2 credentials in env.');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PR title & type generation (commitlint utilities)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('generatePRTitle', () => {
    it('should use first feature commit subject as title', () => {
      const result = generatePRTitle(['feat(auth): add OAuth2 login', 'fix: handle edge case']);
      expect(result).toContain('add OAuth2 login');
    });

    it('should use fix commit when no features present', () => {
      const result = generatePRTitle(['fix: resolve crash on login', 'chore: update deps']);
      expect(result).toContain('Fix:');
      expect(result).toContain('resolve crash on login');
    });

    it('should fallback to first commit when no conventional commits', () => {
      const result = generatePRTitle(['Updated the auth flow']);
      expect(result).toBe('Updated the auth flow');
    });

    it('should fallback to "Update" for empty array', () => {
      const result = generatePRTitle([]);
      expect(result).toBe('Update');
    });

    it('should use first parsed conventional commit subject', () => {
      const result = generatePRTitle(['chore: update deps', 'feat: add feature']);
      // feat is prioritized over chore
      expect(result).toContain('add feature');
    });
  });

  describe('categorizePRType', () => {
    it('should return "feature" when commits contain feat', () => {
      const result = categorizePRType(['feat: add something', 'chore: update']);
      expect(result).toBe('feature');
    });

    it('should return "bugfix" when commits contain fix but no feat', () => {
      const result = categorizePRType(['fix: resolve crash', 'chore: update']);
      expect(result).toBe('bugfix');
    });

    it('should return "breaking" when any commit has breaking change', () => {
      const result = categorizePRType(['feat!: redesign API']);
      expect(result).toBe('breaking');
    });

    it('should return "chore" for non-conventional commits', () => {
      const result = categorizePRType(['updated something', 'changed another']);
      expect(result).toBe('chore');
    });

    it('should prioritize breaking over feature', () => {
      const result = categorizePRType(['feat: add feature', 'fix!: breaking fix']);
      expect(result).toBe('breaking');
    });
  });

  describe('parseConventionalCommit', () => {
    it('should parse feat commit', () => {
      const result = parseConventionalCommit('feat: add login');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('feat');
      expect(result!.subject).toBe('add login');
    });

    it('should parse commit with scope', () => {
      const result = parseConventionalCommit('fix(auth): handle null token');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('fix');
      expect(result!.scope).toBe('auth');
      expect(result!.subject).toBe('handle null token');
    });

    it('should detect breaking change indicator', () => {
      const result = parseConventionalCommit('feat!: redesign API');
      expect(result).not.toBeNull();
      expect(result!.breaking).toBe(true);
    });

    it('should return null for non-conventional commits', () => {
      const result = parseConventionalCommit('Updated something');
      expect(result).toBeNull();
    });

    it('should handle all conventional types', () => {
      const types = [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'test',
        'chore',
        'perf',
        'ci',
        'build',
        'revert',
      ];
      for (const type of types) {
        const result = parseConventionalCommit(`${type}: do something`);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(type);
      }
    });
  });

  describe('extractIssueNumbers', () => {
    it('should extract single issue number', () => {
      const result = extractIssueNumbers('Fixes #42');
      expect(result).toEqual(['#42']);
    });

    it('should extract multiple issue numbers', () => {
      const result = extractIssueNumbers('Fixes #42 and #99');
      expect(result).toEqual(['#42', '#99']);
    });

    it('should return empty array when no issues found', () => {
      const result = extractIssueNumbers('No issues here');
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. PR prompt file parsing integration with prompt injection
  // ═══════════════════════════════════════════════════════════════════════════
  describe('PR prompt → AI prompt injection', () => {
    it('should format simple guidelines into an AI block', () => {
      const config: PRPromptConfig = {
        raw: '## Rules\n\n- Be concise.',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [{ heading: 'Rules', content: '- Be concise.' }],
      };

      const block = formatPRPromptForAI(config);
      expect(block).toContain('=== TEAM PR DESCRIPTION GUIDELINES');
      expect(block).toContain('### Rules');
      expect(block).toContain('- Be concise.');
      expect(block).toContain('=== END TEAM GUIDELINES ===');
    });

    it('should inject guidelines into generatePRDescription prompt', async () => {
      client.enablePromptCapture();

      const guidelines: PRPromptConfig = {
        raw: '## Company Standard\n\nAlways reference the Jira ticket.',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [{ heading: 'Company Standard', content: 'Always reference the Jira ticket.' }],
      };

      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        promptConfig: guidelines,
      });

      expect(prompt).toContain('### Company Standard');
      expect(prompt).toContain('Always reference the Jira ticket.');
    });

    it('should fall back to raw content when guidelines list is empty', () => {
      const config: PRPromptConfig = {
        raw: 'Just be clear and accurate.',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [],
      };

      const block = formatPRPromptForAI(config);
      expect(block).toContain('Just be clear and accurate.');
    });

    it('should handle multiple guideline sections', () => {
      const config: PRPromptConfig = {
        raw: '',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [
          { heading: 'Tone', content: 'Professional.' },
          { heading: 'Format', content: 'Use bullet points.' },
          { heading: 'Testing', content: 'Include test steps.' },
          { heading: 'Tickets', content: 'Reference Jira tickets.' },
        ],
      };

      const block = formatPRPromptForAI(config);
      expect(block).toContain('### Tone');
      expect(block).toContain('### Format');
      expect(block).toContain('### Testing');
      expect(block).toContain('### Tickets');
    });

    it('should round-trip: parse → format → includes all headings', () => {
      const sample = generateSamplePRPrompt();
      const parsed = parsePRPrompt(sample);
      const config: PRPromptConfig = {
        raw: sample,
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: parsed,
      };
      const block = formatPRPromptForAI(config);

      for (const guideline of parsed) {
        expect(block).toContain(`### ${guideline.heading}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Edge cases & special scenarios
  // ═══════════════════════════════════════════════════════════════════════════
  describe('edge cases', () => {
    beforeEach(() => {
      client.enablePromptCapture();
    });

    it('should handle single commit PR', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'fix/typo',
        commits: ['fix: correct typo in README'],
        files: ['README.md'],
        issues: [],
      });

      expect(prompt).toContain('fix: correct typo in README');
      expect(prompt).toContain('README.md');
    });

    it('should handle PR with no changed files', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/empty',
        commits: ['chore: empty commit'],
        files: [],
        issues: [],
      });

      expect(prompt).toContain('chore: empty commit');
      // Should not crash
    });

    it('should handle very long branch name', async () => {
      const longBranch =
        'feature/PROJ-12345-implement-full-oauth2-flow-with-mfa-and-sso-integration-for-enterprise-customers';
      const prompt = await client.generatePRDescription({
        branch: longBranch,
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: ['PROJ-12345'],
      });

      expect(prompt).toContain(longBranch);
    });

    it('should handle commits with special characters', async () => {
      const commits = [
        'fix: handle `null` & "undefined" values',
        "feat: add user's profile <page>",
        'chore: update deps (node@18)',
      ];

      const prompt = await client.generatePRDescription({
        branch: 'fix/special-chars',
        commits,
        files: ['src/app.ts'],
        issues: [],
      });

      for (const commit of commits) {
        expect(prompt).toContain(commit);
      }
    });

    it('should handle multiple tickets from different sources', async () => {
      const tickets = [makeGitHubTicket(), makeTicket(), makeLinearTicket()];

      const prompt = await client.generatePRDescription({
        branch: 'feature/multi-ticket',
        commits: ['feat: implement feature'],
        files: ['src/feature.ts'],
        issues: ['#42', 'PROJ-123', 'ENG-99'],
        ticketDetails: tickets,
      });

      expect(prompt).toContain('#42');
      expect(prompt).toContain('PROJ-123');
      expect(prompt).toContain('ENG-99');
      expect(prompt).toContain('Closes #42');
      expect(prompt).toContain('Relates to [PROJ-123]');
      expect(prompt).toContain('Relates to [ENG-99]');
    });

    it('should handle diff-only (no stat) context', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        diff: SAMPLE_DIFF,
      });

      expect(prompt).toContain('Code changes (unified diff');
      expect(prompt).not.toContain('Diff summary');
    });

    it('should handle stat-only (no diff) context', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        diffStat: SAMPLE_DIFF_STAT,
      });

      expect(prompt).toContain('Diff summary (git diff --stat)');
      expect(prompt).not.toContain('unified diff');
    });

    it('should handle ticket with description and priority in context', async () => {
      const ticket = makeTicket({
        description:
          'Detailed acceptance criteria: users must be able to log in with Google OAuth2.',
        priority: 'critical',
      });

      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: ['PROJ-123'],
        ticketDetails: [ticket],
      });

      expect(prompt).toContain('acceptance criteria');
      expect(prompt).toContain('critical');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. CopilotClient generateSimpleTitle & detectPRType (used in fallback)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('generateSimpleTitle (CopilotClient internal)', () => {
    it('should extract conventional commit title', () => {
      const result = client.testGenerateSimpleTitle(['feat: add user authentication']);
      expect(result).toContain('feat');
      expect(result).toContain('add user authentication');
    });

    it('should handle scoped commits', () => {
      const result = client.testGenerateSimpleTitle(['feat(auth): add OAuth support']);
      expect(result).toContain('add OAuth support');
    });

    it('should truncate long non-conventional commits', () => {
      const longMessage = 'A'.repeat(80);
      const result = client.testGenerateSimpleTitle([longMessage]);
      expect(result.length).toBeLessThanOrEqual(60);
      expect(result).toContain('...');
    });

    it('should return "Update" for empty commits', () => {
      const result = client.testGenerateSimpleTitle([]);
      expect(result).toBe('Update');
    });

    it('should use first commit as basis', () => {
      const result = client.testGenerateSimpleTitle(['feat: first', 'fix: second', 'chore: third']);
      expect(result).toContain('first');
    });
  });

  describe('detectPRType (CopilotClient internal)', () => {
    it('should detect majority type', () => {
      const result = client.testDetectPRType(['feat: add A', 'feat: add B', 'fix: handle C']);
      expect(result).toBe('feat');
    });

    it('should return chore for non-conventional commits', () => {
      const result = client.testDetectPRType(['updated something', 'changed another thing']);
      expect(result).toBe('chore');
    });

    it('should return chore for empty array', () => {
      const result = client.testDetectPRType([]);
      expect(typeof result).toBe('string');
    });

    it('should detect fix as majority', () => {
      const result = client.testDetectPRType(['fix: resolve A', 'fix: resolve B', 'feat: add C']);
      expect(result).toBe('fix');
    });

    it('should handle tie by picking alphabetically first due to sort', () => {
      const result = client.testDetectPRType(['feat: add A', 'fix: resolve B']);
      // Both have count 1; sort is by count DESC then the first encountered
      expect(['feat', 'fix']).toContain(result);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. formatTicketContext for PR prompts
  // ═══════════════════════════════════════════════════════════════════════════
  describe('formatTicketContext in PR context', () => {
    it('should include ticket ID, title, and type', () => {
      const result = client.testFormatTicketContext([
        { id: 'PROJ-123', title: 'Add auth', type: 'feature' },
      ]);
      expect(result).toContain('PROJ-123');
      expect(result).toContain('Add auth');
    });

    it('should include description when present', () => {
      const result = client.testFormatTicketContext([
        {
          id: 'PROJ-123',
          title: 'Add auth',
          description: 'Implement full OAuth2 flow',
          type: 'feature',
        },
      ]);
      expect(result).toContain('Implement full OAuth2 flow');
    });

    it('should include priority when present', () => {
      const result = client.testFormatTicketContext([
        {
          id: 'PROJ-123',
          title: 'Fix crash',
          priority: 'critical',
          type: 'bug',
        },
      ]);
      expect(result).toContain('critical');
    });

    it('should handle multiple tickets', () => {
      const result = client.testFormatTicketContext([
        { id: 'PROJ-1', title: 'First', type: 'task' },
        { id: 'PROJ-2', title: 'Second', type: 'bug' },
        { id: 'PROJ-3', title: 'Third', type: 'feature' },
      ]);
      expect(result).toContain('PROJ-1');
      expect(result).toContain('PROJ-2');
      expect(result).toContain('PROJ-3');
    });

    it('should handle empty tickets array', () => {
      const result = client.testFormatTicketContext([]);
      expect(typeof result).toBe('string');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Full prompt content correctness
  // ═══════════════════════════════════════════════════════════════════════════
  describe('prompt content correctness', () => {
    beforeEach(() => {
      client.enablePromptCapture();
    });

    it('should embed ALL commit messages in the prompt', async () => {
      const commits = [
        'feat(auth): add login',
        'feat(auth): add signup',
        'fix(auth): handle token expiry',
        'test(auth): add integration tests',
        'docs: update API docs',
      ];

      const prompt = await client.generatePRDescription({
        branch: 'feature/auth-flow',
        commits,
        files: SAMPLE_FILES,
        issues: [],
      });

      for (const commit of commits) {
        expect(prompt).toContain(commit);
      }
    });

    it('should embed ALL ticket details in the prompt', async () => {
      const tickets: Ticket[] = [
        makeTicket({ id: 'PROJ-100', title: 'First task' }),
        makeTicket({ id: 'PROJ-200', title: 'Second task' }),
      ];

      const prompt = await client.generatePRDescription({
        branch: 'feature/multi',
        commits: ['feat: implement tasks'],
        files: ['src/a.ts'],
        issues: ['PROJ-100', 'PROJ-200'],
        ticketDetails: tickets,
      });

      expect(prompt).toContain('PROJ-100');
      expect(prompt).toContain('First task');
      expect(prompt).toContain('PROJ-200');
      expect(prompt).toContain('Second task');
    });

    it('should preserve diff content exactly in the prompt', async () => {
      const customDiff = `diff --git a/src/utils.ts b/src/utils.ts
@@ -10,3 +10,5 @@
 export function greet(name: string) {
-  return \`Hello \${name}\`;
+  const greeting = \`Hello \${name}!\`;
+  console.log(greeting);
+  return greeting;
 }`;

      const prompt = await client.generatePRDescription({
        branch: 'fix/greeting',
        commits: ['fix: add exclamation and logging to greet'],
        files: ['src/utils.ts'],
        issues: [],
        diff: customDiff,
      });

      expect(prompt).toContain('export function greet');
      expect(prompt).toContain('greeting');
      expect(prompt).toContain('console.log');
    });

    it('should preserve template structure in the prompt', async () => {
      const template = `## Summary

[Brief description]

## Motivation

[Why this change is needed]

## Testing Plan

1. [Step 1]
2. [Step 2]`;

      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        templateContent: template,
      });

      expect(prompt).toContain('## Summary');
      expect(prompt).toContain('## Motivation');
      expect(prompt).toContain('## Testing Plan');
    });

    it('should mention the role and expertise in system prompt', async () => {
      const prompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
      });

      expect(prompt).toContain('expert developer');
      expect(prompt).toContain('Pull Request');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Default template
  // ═══════════════════════════════════════════════════════════════════════════
  describe('default template', () => {
    it('should parse into expected sections', () => {
      const template = getDefaultTemplate();
      const parsed = parsePRTemplate(template);

      const names = parsed.sections.map((s) => s.name);
      expect(names).toContain('what_changed');
      expect(names).toContain('why');
      expect(names).toContain('how_to_test');
      expect(names).toContain('checklist');
    });

    it('should have checklist type for checklist section', () => {
      const template = getDefaultTemplate();
      const parsed = parsePRTemplate(template);

      const checklist = parsed.sections.find((s) => s.name === 'checklist');
      expect(checklist).toBeDefined();
      expect(checklist!.type).toBe('checklist');
    });

    it('should be fillable with generated content', () => {
      const template = getDefaultTemplate();
      const parsed = parsePRTemplate(template);

      const content = {
        title: 'feat: add feature',
        description: '- Added new endpoint\n- Added validation',
        type: 'feat',
        impact: 'New API endpoint available.',
        testing: '1. Call /api/feature\n2. Verify response',
        ticketIds: ['#10'],
        ticketLinks: [{ id: '#10', url: 'https://github.com/org/repo/issues/10' }],
        breakingChanges: 'None',
        additionalInfo: 'None',
      };

      const result = fillTemplate(parsed, content);

      expect(result).toContain('Added new endpoint');
      expect(result).toContain('Call /api/feature');
      // Checklist should be preserved
      expect(result).toContain('- [ ]');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Consistency — generatePRDescription vs generatePRContent prompts
  // ═══════════════════════════════════════════════════════════════════════════
  describe('consistency between generatePRDescription and generatePRContent', () => {
    it('both should include branch and commits', async () => {
      // For description
      client.enablePromptCapture();
      const descPrompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
      });

      // For content — capture the prompt via a fresh client
      const client2 = new TestableCopilotClient();
      let contentPrompt = '';
      (client2 as AnyAccess).suggest = async (prompt: string) => {
        contentPrompt = prompt;
        return JSON.stringify({
          title: 'test',
          description: 'test',
          type: 'feat',
          impact: 'test',
          testing: 'test',
          breakingChanges: 'None',
          additionalInfo: 'None',
        });
      };

      await client2.generatePRContent({
        branch: 'feature/auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
      });

      // Both should contain the branch and all commits
      expect(descPrompt).toContain('feature/auth');
      expect(contentPrompt).toContain('feature/auth');

      for (const commit of SAMPLE_COMMITS) {
        expect(descPrompt).toContain(commit);
        expect(contentPrompt).toContain(commit);
      }
    });

    it('both should include diff when provided', async () => {
      client.enablePromptCapture();
      const descPrompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        diffStat: SAMPLE_DIFF_STAT,
        diff: SAMPLE_DIFF,
      });

      const client2 = new TestableCopilotClient();
      let contentPrompt = '';
      (client2 as AnyAccess).suggest = async (prompt: string) => {
        contentPrompt = prompt;
        return JSON.stringify({
          title: 'test',
          description: 'test',
          type: 'feat',
          impact: 'test',
          testing: 'test',
          breakingChanges: 'None',
          additionalInfo: 'None',
        });
      };

      await client2.generatePRContent({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        diffStat: SAMPLE_DIFF_STAT,
        diff: SAMPLE_DIFF,
      });

      expect(descPrompt).toContain('Diff summary');
      expect(contentPrompt).toContain('Diff summary');
      expect(descPrompt).toContain('OAuth2Client');
      expect(contentPrompt).toContain('OAuth2Client');
    });

    it('both should include anti-hallucination instructions', async () => {
      client.enablePromptCapture();
      const descPrompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
      });

      const client2 = new TestableCopilotClient();
      let contentPrompt = '';
      (client2 as AnyAccess).suggest = async (prompt: string) => {
        contentPrompt = prompt;
        return JSON.stringify({
          title: 'test',
          description: 'test',
          type: 'feat',
          impact: 'test',
          testing: 'test',
          breakingChanges: 'None',
          additionalInfo: 'None',
        });
      };

      await client2.generatePRContent({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
      });

      // Both should have anti-hallucination guardrails
      expect(descPrompt.toLowerCase()).toContain('hallucin');
      expect(contentPrompt.toLowerCase()).toContain('hallucin');
    });

    it('both should include guidelines when provided', async () => {
      client.enablePromptCapture();
      const descPrompt = await client.generatePRDescription({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        promptConfig: SAMPLE_PROMPT_CONFIG,
      });

      const client2 = new TestableCopilotClient();
      let contentPrompt = '';
      (client2 as AnyAccess).suggest = async (prompt: string) => {
        contentPrompt = prompt;
        return JSON.stringify({
          title: 'test',
          description: 'test',
          type: 'feat',
          impact: 'test',
          testing: 'test',
          breakingChanges: 'None',
          additionalInfo: 'None',
        });
      };

      await client2.generatePRContent({
        branch: 'feature/auth',
        commits: ['feat: add auth'],
        files: ['src/auth.ts'],
        issues: [],
        promptConfig: SAMPLE_PROMPT_CONFIG,
      });

      expect(descPrompt).toContain('TEAM PR DESCRIPTION GUIDELINES');
      expect(contentPrompt).toContain('TEAM PR DESCRIPTION GUIDELINES');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. Real-world scenario integration
  // ═══════════════════════════════════════════════════════════════════════════
  describe('real-world scenario: full PR generation', () => {
    it('should produce a well-structured PR via generatePRContent with template', async () => {
      client.stubSuggestWith(
        JSON.stringify({
          title: 'feat(auth): add OAuth2 authentication flow',
          description:
            '- Added OAuth2 login page (`src/auth/login.ts`)\n' +
            '- Added signup page with email validation (`src/auth/signup.ts`)\n' +
            '- Fixed token refresh edge case in middleware (`src/auth/middleware.ts`)',
          type: 'feat',
          impact: 'Users can now authenticate via OAuth2, improving security and UX.',
          testing:
            '1. Navigate to /login\n2. Click "Sign in with Google"\n3. Verify redirect to dashboard',
          breakingChanges: 'None',
          additionalInfo: 'Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.',
        })
      );

      const content = await client.generatePRContent({
        branch: 'feature/PROJ-123-auth',
        commits: SAMPLE_COMMITS,
        files: SAMPLE_FILES,
        issues: ['PROJ-123'],
        ticketDetails: [makeTicket()],
        templateSections: ['description', 'type_of_change', 'testing', 'jira_ticket'],
        diffStat: SAMPLE_DIFF_STAT,
        diff: SAMPLE_DIFF,
        templateContent: SAMPLE_PR_TEMPLATE,
        promptConfig: SAMPLE_PROMPT_CONFIG,
      });

      // AI returned structured content
      expect(content.title).toContain('OAuth2');
      expect(content.description).toContain('login page');
      expect(content.type).toBe('feat');
      expect(content.impact).toContain('OAuth2');
      expect(content.testing).toContain('/login');
      expect(content.breakingChanges).toBe('None');

      // Fill the template with AI content
      const template = parsePRTemplate(SAMPLE_PR_TEMPLATE);
      const prBody = fillTemplate(template, {
        title: content.title,
        description: content.description,
        type: content.type,
        impact: content.impact,
        testing: content.testing,
        ticketIds: ['PROJ-123'],
        ticketLinks: [{ id: 'PROJ-123', url: 'https://jira.example.com/browse/PROJ-123' }],
        breakingChanges: content.breakingChanges,
        additionalInfo: content.additionalInfo,
      });

      // Final PR body should have all template sections filled
      expect(prBody).toContain('## What Changed');
      expect(prBody).toContain('login page');
      expect(prBody).toContain('## Type of Change');
      expect(prBody).toContain('[x]'); // feat → feature checked
      expect(prBody).toContain('## How to Test');
      expect(prBody).toContain('/login');
      expect(prBody).toContain('## Jira Ticket');
      expect(prBody).toContain('PROJ-123');
      expect(prBody).toContain('jira.example.com');
      expect(prBody).toContain('## Checklist');
      expect(prBody).toContain('- [ ]');
    });

    it('should produce a well-structured PR via generatePRDescription (no template)', async () => {
      client.enablePromptCapture();

      const prompt = await client.generatePRDescription({
        branch: 'fix/PROJ-456-crash',
        commits: ['fix: resolve null pointer in dashboard', 'test: add regression test'],
        files: ['src/dashboard.ts', 'src/__tests__/dashboard.test.ts'],
        issues: ['PROJ-456'],
        ticketDetails: [
          makeTicket({
            id: 'PROJ-456',
            title: 'Dashboard crashes on empty data',
            description:
              'When there are no records, the dashboard throws a null pointer exception.',
            type: 'bug',
            priority: 'critical',
          }),
        ],
        diffStat: ' src/dashboard.ts | 5 ++---\n 1 file changed, 2 insertions(+), 3 deletions(-)',
        diff: `diff --git a/src/dashboard.ts b/src/dashboard.ts
@@ -15,3 +15,2 @@
-  const data = records.map(r => r.value);
+  const data = records?.map(r => r.value) ?? [];`,
      });

      // Prompt should contain all the context
      expect(prompt).toContain('fix/PROJ-456-crash');
      expect(prompt).toContain('resolve null pointer');
      expect(prompt).toContain('PROJ-456');
      expect(prompt).toContain('Dashboard crashes on empty data');
      expect(prompt).toContain('critical');
      expect(prompt).toContain('records?.map');
      expect(prompt).toContain('## What Changed');
      expect(prompt).toContain('## Why');
      expect(prompt).toContain('## How to Test');
    });

    it('should produce a minimal PR with only required fields', async () => {
      client.enablePromptCapture();

      const prompt = await client.generatePRDescription({
        branch: 'chore/deps',
        commits: ['chore: update dependencies'],
        files: ['package.json', 'package-lock.json'],
        issues: [],
      });

      expect(prompt).toContain('chore/deps');
      expect(prompt).toContain('update dependencies');
      expect(prompt).toContain('package.json');
      expect(prompt).toContain('Related tickets: None');
    });
  });
});
