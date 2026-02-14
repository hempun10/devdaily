import { describe, it, expect } from 'vitest';
import {
  parsePRPrompt,
  formatPRPromptForAI,
  generateSamplePRPrompt,
} from '../src/core/pr-prompt.js';
import type { PRPromptConfig } from '../src/core/pr-prompt.js';

describe('PR Prompt', () => {
  describe('parsePRPrompt', () => {
    it('should parse a simple prompt file with headings', () => {
      const content = `# PR Guidelines

## Tone & Style

- Be concise
- Use bullet points

## Testing Instructions

- Include step-by-step instructions
- Mention edge cases`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(3);
      expect(guidelines[0].heading).toBe('PR Guidelines');
      expect(guidelines[1].heading).toBe('Tone & Style');
      expect(guidelines[1].content).toContain('Be concise');
      expect(guidelines[1].content).toContain('Use bullet points');
      expect(guidelines[2].heading).toBe('Testing Instructions');
      expect(guidelines[2].content).toContain('step-by-step');
    });

    it('should handle content before any heading as a General section', () => {
      const content = `Always write clear descriptions.

## Format

Use markdown.`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(2);
      expect(guidelines[0].heading).toBe('General');
      expect(guidelines[0].content).toContain('Always write clear descriptions.');
      expect(guidelines[1].heading).toBe('Format');
    });

    it('should handle empty content', () => {
      const guidelines = parsePRPrompt('');

      expect(guidelines).toHaveLength(0);
    });

    it('should handle content with only headings and no body', () => {
      const content = `## Section A
## Section B
## Section C`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(3);
      expect(guidelines[0].heading).toBe('Section A');
      expect(guidelines[0].content).toBe('');
      expect(guidelines[1].heading).toBe('Section B');
      expect(guidelines[1].content).toBe('');
      expect(guidelines[2].heading).toBe('Section C');
      expect(guidelines[2].content).toBe('');
    });

    it('should handle h1, h2, and h3 headings', () => {
      const content = `# Top Level

Top level content

## Second Level

Second level content

### Third Level

Third level content`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(3);
      expect(guidelines[0].heading).toBe('Top Level');
      expect(guidelines[1].heading).toBe('Second Level');
      expect(guidelines[2].heading).toBe('Third Level');
    });

    it('should preserve multiline content within a section', () => {
      const content = `## Description Format

- Start with a one-sentence summary
- Follow with bullet points

Each bullet should be specific.
Reference actual file changes.

Use the diff to verify accuracy.`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(1);
      expect(guidelines[0].content).toContain('Start with a one-sentence summary');
      expect(guidelines[0].content).toContain('Each bullet should be specific.');
      expect(guidelines[0].content).toContain('Use the diff to verify accuracy.');
    });

    it('should handle content with code blocks', () => {
      const content = `## Examples

Here is an example:

\`\`\`
## What Changed

- Added new endpoint /api/users
\`\`\`

Follow this format.`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(1);
      expect(guidelines[0].heading).toBe('Examples');
      expect(guidelines[0].content).toContain('```');
      expect(guidelines[0].content).toContain('Follow this format.');
    });

    it('should trim content whitespace in sections', () => {
      const content = `## Section

   Content with leading spaces

## Next Section

More content`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(2);
      // Content should be trimmed at start and end
      expect(guidelines[0].content).not.toMatch(/^\s+/);
      expect(guidelines[0].content).not.toMatch(/\s+$/);
    });

    it('should handle a realistic team guidelines file', () => {
      const content = `# Acme Corp PR Guidelines

## Tone

- Professional but friendly
- No jargon for non-technical sections

## Required Sections

Every PR must include:
1. What changed
2. Why it changed
3. How to test
4. Impact assessment

## Ticket References

- Always include Jira ticket IDs
- Format: "Relates to [ACME-123](https://jira.acme.com/ACME-123)"
- Place at the bottom of the description

## What NOT to Include

- Don't list every file (that's in the diff)
- Don't repeat commit messages verbatim
- Don't include TODOs`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(5);
      expect(guidelines[0].heading).toBe('Acme Corp PR Guidelines');
      expect(guidelines[1].heading).toBe('Tone');
      expect(guidelines[2].heading).toBe('Required Sections');
      expect(guidelines[2].content).toContain('Impact assessment');
      expect(guidelines[3].heading).toBe('Ticket References');
      expect(guidelines[3].content).toContain('ACME-123');
      expect(guidelines[4].heading).toBe('What NOT to Include');
    });
  });

  describe('formatPRPromptForAI', () => {
    it('should wrap guidelines in clearly delineated blocks', () => {
      const promptConfig: PRPromptConfig = {
        raw: '## Tone\n\nBe concise.',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [{ heading: 'Tone', content: 'Be concise.' }],
      };

      const result = formatPRPromptForAI(promptConfig);

      expect(result).toContain('=== TEAM PR DESCRIPTION GUIDELINES');
      expect(result).toContain('=== END TEAM GUIDELINES ===');
      expect(result).toContain('### Tone');
      expect(result).toContain('Be concise.');
    });

    it('should include all guideline sections', () => {
      const promptConfig: PRPromptConfig = {
        raw: '',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [
          { heading: 'Tone', content: 'Professional.' },
          { heading: 'Format', content: 'Use bullet points.' },
          { heading: 'Testing', content: 'Include steps.' },
        ],
      };

      const result = formatPRPromptForAI(promptConfig);

      expect(result).toContain('### Tone');
      expect(result).toContain('Professional.');
      expect(result).toContain('### Format');
      expect(result).toContain('Use bullet points.');
      expect(result).toContain('### Testing');
      expect(result).toContain('Include steps.');
    });

    it('should fall back to raw content when no guidelines are parsed', () => {
      const rawContent = 'Just be concise and clear in all PR descriptions.';
      const promptConfig: PRPromptConfig = {
        raw: rawContent,
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [],
      };

      const result = formatPRPromptForAI(promptConfig);

      expect(result).toContain(rawContent);
      expect(result).toContain('=== TEAM PR DESCRIPTION GUIDELINES');
      expect(result).toContain('=== END TEAM GUIDELINES ===');
    });

    it('should handle guidelines with empty content', () => {
      const promptConfig: PRPromptConfig = {
        raw: '## Empty Section',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [{ heading: 'Empty Section', content: '' }],
      };

      const result = formatPRPromptForAI(promptConfig);

      expect(result).toContain('### Empty Section');
      // Should not crash or produce garbage
      expect(result).toContain('=== END TEAM GUIDELINES ===');
    });

    it('should include "follow these strictly" instruction', () => {
      const promptConfig: PRPromptConfig = {
        raw: '## Rules\n\nRule 1.',
        path: '/repo/.devdaily-pr-prompt.md',
        guidelines: [{ heading: 'Rules', content: 'Rule 1.' }],
      };

      const result = formatPRPromptForAI(promptConfig);

      expect(result).toContain('follow these strictly');
    });
  });

  describe('generateSamplePRPrompt', () => {
    it('should return a non-empty string', () => {
      const sample = generateSamplePRPrompt();

      expect(sample).toBeTruthy();
      expect(sample.length).toBeGreaterThan(100);
    });

    it('should contain key sections', () => {
      const sample = generateSamplePRPrompt();

      expect(sample).toContain('Tone');
      expect(sample).toContain('Style');
      expect(sample).toContain('Description');
      expect(sample).toContain('Ticket');
      expect(sample).toContain('Testing');
      expect(sample).toContain('Breaking');
    });

    it('should be parseable by parsePRPrompt', () => {
      const sample = generateSamplePRPrompt();
      const guidelines = parsePRPrompt(sample);

      expect(guidelines.length).toBeGreaterThanOrEqual(3);

      const headings = guidelines.map((g) => g.heading);
      // Should have at least a title and some sections
      expect(headings.some((h) => h.includes('Guideline') || h.includes('PR'))).toBe(true);
    });

    it('should have meaningful content in each section', () => {
      const sample = generateSamplePRPrompt();
      const guidelines = parsePRPrompt(sample);

      for (const guideline of guidelines) {
        // Every section should have either a heading-only purpose or actual content
        expect(guideline.heading.length).toBeGreaterThan(0);
      }

      // At least some sections should have content
      const withContent = guidelines.filter((g) => g.content.length > 0);
      expect(withContent.length).toBeGreaterThanOrEqual(3);
    });

    it('should contain actionable guidance, not just placeholders', () => {
      const sample = generateSamplePRPrompt();

      // Should contain actual guidance words
      expect(sample).toContain('concise');
      expect(sample).toContain('bullet');
      // Should not be placeholder-heavy
      expect(sample).not.toContain('[TODO]');
      expect(sample).not.toContain('[PLACEHOLDER]');
    });

    it('should mention customization', () => {
      const sample = generateSamplePRPrompt();

      // Should tell users they can customize it
      expect(sample.toLowerCase()).toContain('customize');
    });
  });

  describe('parsePRPrompt edge cases', () => {
    it('should handle Windows-style line endings', () => {
      const content = '## Section A\r\n\r\nContent A\r\n\r\n## Section B\r\n\r\nContent B';
      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(2);
      expect(guidelines[0].heading).toBe('Section A');
      expect(guidelines[1].heading).toBe('Section B');
    });

    it('should handle headings with special characters', () => {
      const content = `## What's New?

New stuff here.

## Don't Do This!

Bad stuff here.`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(2);
      expect(guidelines[0].heading).toBe("What's New?");
      expect(guidelines[1].heading).toBe("Don't Do This!");
    });

    it('should handle a single line file', () => {
      const content = 'Be concise in PR descriptions.';
      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(1);
      expect(guidelines[0].heading).toBe('General');
      expect(guidelines[0].content).toContain('Be concise');
    });

    it('should handle a file with only a heading', () => {
      const content = '# PR Rules';
      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(1);
      expect(guidelines[0].heading).toBe('PR Rules');
      expect(guidelines[0].content).toBe('');
    });

    it('should not treat h4+ as headings', () => {
      const content = `## Real Heading

#### Not a heading

Some content.`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(1);
      expect(guidelines[0].heading).toBe('Real Heading');
      // h4 should be treated as content, not a new section
      expect(guidelines[0].content).toContain('#### Not a heading');
      expect(guidelines[0].content).toContain('Some content.');
    });

    it('should handle consecutive blank lines', () => {
      const content = `## Section



Content after blanks.`;

      const guidelines = parsePRPrompt(content);

      expect(guidelines).toHaveLength(1);
      expect(guidelines[0].content).toContain('Content after blanks.');
    });
  });
});
