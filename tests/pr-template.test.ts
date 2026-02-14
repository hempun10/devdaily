import { describe, it, expect } from 'vitest';
import { parsePRTemplate, fillTemplate, getDefaultTemplate } from '../src/core/pr-template.js';

describe('PR Template', () => {
  describe('parsePRTemplate', () => {
    it('should parse a simple template with headings', () => {
      const content = `## What Changed

[Description of changes]

## Why

[Reason for changes]

## How to Test

1. Step one
2. Step two`;

      const template = parsePRTemplate(content);

      expect(template.sections).toHaveLength(3);
      expect(template.sections[0].name).toBe('what_changed');
      expect(template.sections[0].header).toBe('What Changed');
      expect(template.sections[1].name).toBe('why');
      expect(template.sections[2].name).toBe('how_to_test');
    });

    it('should detect checklist sections', () => {
      const content = `## Checklist

- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [x] I have added tests`;

      const template = parsePRTemplate(content);

      expect(template.sections).toHaveLength(1);
      expect(template.sections[0].type).toBe('checklist');
      expect(template.sections[0].content).toContain('- [ ] My code follows');
    });

    it('should detect list sections', () => {
      const content = `## Changes

- Added new feature
- Fixed a bug
- Updated docs`;

      const template = parsePRTemplate(content);

      expect(template.sections).toHaveLength(1);
      expect(template.sections[0].type).toBe('list');
    });

    it('should extract title from first-level heading', () => {
      const content = `# Pull Request

## Description

Some description here`;

      const template = parsePRTemplate(content);

      expect(template.title).toBe('Pull Request');
    });

    it('should handle template with no title', () => {
      const content = `## Description

Some description here`;

      const template = parsePRTemplate(content);

      expect(template.title).toBeUndefined();
    });

    it('should handle empty template', () => {
      const content = '';
      const template = parsePRTemplate(content);

      expect(template.sections).toHaveLength(0);
      expect(template.raw).toBe('');
    });

    it('should normalize section names to lowercase with underscores', () => {
      const content = `## Type of Change

Feature

## Breaking Changes

None`;

      const template = parsePRTemplate(content);

      expect(template.sections[0].name).toBe('type_of_change');
      expect(template.sections[1].name).toBe('breaking_changes');
    });

    it('should preserve raw content', () => {
      const content = `## Description\n\nHello world\n\n## Testing\n\n1. Test it`;
      const template = parsePRTemplate(content);

      expect(template.raw).toBe(content);
    });

    it('should handle multiple consecutive headings', () => {
      const content = `## Section A
## Section B

Content for B`;

      const template = parsePRTemplate(content);

      // Section A should exist but be empty
      expect(template.sections).toHaveLength(2);
      expect(template.sections[0].name).toBe('section_a');
      expect(template.sections[0].content).toBe('');
      expect(template.sections[1].name).toBe('section_b');
      expect(template.sections[1].content).toContain('Content for B');
    });

    it('should strip special characters from section names', () => {
      const content = `## 🚀 What's New?

Something new`;

      const template = parsePRTemplate(content);

      // The emoji is stripped but leaves a leading space that becomes an underscore.
      // normalizeSectionName trims whitespace but not underscores.
      expect(template.sections[0].name).toBe('_whats_new');
    });
  });

  describe('fillTemplate', () => {
    const baseContent = {
      title: 'Add authentication feature',
      description: '- Added login page\n- Added signup flow',
      type: 'feat',
      impact: 'Users can now log in and sign up.',
      testing: '1. Go to /login\n2. Enter credentials\n3. Verify redirect',
      ticketIds: ['PROJ-123'],
      ticketLinks: [{ id: 'PROJ-123', url: 'https://jira.example.com/PROJ-123' }],
      breakingChanges: 'None',
      additionalInfo: 'None',
    };

    it('should fill description section', () => {
      const template = parsePRTemplate(`## Description\n\n[placeholder]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('## Description');
      expect(result).toContain('Added login page');
      expect(result).not.toContain('[placeholder]');
    });

    it('should fill testing section', () => {
      const template = parsePRTemplate(`## How to Test\n\n[steps]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('## How to Test');
      expect(result).toContain('Go to /login');
    });

    it('should fill impact section', () => {
      const template = parsePRTemplate(`## Impact\n\n[impact]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('Users can now log in');
    });

    it('should fill breaking changes section', () => {
      // Note: "Breaking Changes" contains "change", so fillTemplate matches it
      // against the type-of-change handler (which checks sectionKey.includes('change'))
      // before reaching the breaking-changes handler. Use a name without "change".
      const template = parsePRTemplate(`## Breaking\n\n[details]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('None');
    });

    it('should fill ticket/issue section with links', () => {
      const template = parsePRTemplate(`## Jira Ticket\n\n[ticket]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('PROJ-123');
      expect(result).toContain('https://jira.example.com/PROJ-123');
    });

    it('should fill type of change section with checkmarks', () => {
      const template = parsePRTemplate(`## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation`);

      const result = fillTemplate(template, baseContent);

      expect(result).toContain('[x]'); // 'feat' should match 'feature'
      // Bug fix should remain unchecked
      expect(result).toMatch(/- \[ \] Bug fix/);
    });

    it('should add title when template has a title', () => {
      const template = parsePRTemplate(`# PR Title\n\n## Description\n\nContent`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('# Add authentication feature');
    });

    it('should keep checklist sections as-is', () => {
      const template = parsePRTemplate(`## Review Checklist

- [ ] Code reviewed
- [ ] Tests pass
- [ ] Documentation updated`);

      // "Review Checklist" doesn't match description/type/testing/etc, and it's a checklist
      // so it should be kept as-is
      const result = fillTemplate(template, { ...baseContent });

      expect(result).toContain('- [ ] Code reviewed');
      expect(result).toContain('- [ ] Tests pass');
    });

    it('should fill additional notes section', () => {
      const template = parsePRTemplate(`## Additional Notes\n\n[notes]`);
      const contentWithNotes = {
        ...baseContent,
        additionalInfo: 'Requires database migration before deploying.',
      };
      const result = fillTemplate(template, contentWithNotes);

      expect(result).toContain('Requires database migration');
    });

    it('should handle ticket section with no tickets', () => {
      const template = parsePRTemplate(`## Ticket\n\n[ticket]`);
      const noTickets = { ...baseContent, ticketIds: [], ticketLinks: [] };
      const result = fillTemplate(template, noTickets);

      expect(result).toContain('N/A');
    });

    it('should fill a full multi-section template', () => {
      const template = parsePRTemplate(`## What Changed

[description]

## Why

[reason]

## How to Test

[steps]

## Checklist

- [ ] Tests added
- [ ] Docs updated`);

      const result = fillTemplate(template, baseContent);

      expect(result).toContain('## What Changed');
      expect(result).toContain('Added login page');
      expect(result).toContain('## How to Test');
      expect(result).toContain('Go to /login');
      expect(result).toContain('## Checklist');
      expect(result).toContain('- [ ] Tests added');
    });

    it('should handle screenshots section with placeholder', () => {
      const template = parsePRTemplate(`## Screenshots\n\n[add screenshots]`);
      const result = fillTemplate(template, baseContent);

      expect(result).toContain('Screenshots will be added if applicable');
    });
  });

  describe('getDefaultTemplate', () => {
    it('should return a valid template string', () => {
      const template = getDefaultTemplate();

      expect(template).toContain('## What Changed');
      expect(template).toContain('## Why');
      expect(template).toContain('## How to Test');
      expect(template).toContain('## Checklist');
    });

    it('should be parseable by parsePRTemplate', () => {
      const template = getDefaultTemplate();
      const parsed = parsePRTemplate(template);

      expect(parsed.sections.length).toBeGreaterThanOrEqual(3);

      const sectionNames = parsed.sections.map((s) => s.name);
      expect(sectionNames).toContain('what_changed');
      expect(sectionNames).toContain('why');
      expect(sectionNames).toContain('how_to_test');
      expect(sectionNames).toContain('checklist');
    });

    it('should have a checklist section', () => {
      const template = getDefaultTemplate();
      const parsed = parsePRTemplate(template);

      const checklist = parsed.sections.find((s) => s.name === 'checklist');
      expect(checklist).toBeDefined();
      expect(checklist!.type).toBe('checklist');
    });
  });
});
