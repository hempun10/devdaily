/**
 * PR Template Detection and Parsing
 * Finds and parses GitHub PR templates to provide structured PR descriptions
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';

export interface PRTemplateSection {
  name: string;
  header: string;
  content: string;
  type: 'heading' | 'checklist' | 'list' | 'text';
  required: boolean;
}

export interface PRTemplate {
  path: string;
  raw: string;
  title?: string;
  sections: PRTemplateSection[];
}

/**
 * Common PR template locations (in order of precedence)
 */
const TEMPLATE_PATHS = [
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE/default.md',
  'docs/PULL_REQUEST_TEMPLATE.md',
  'PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
];

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find PR template in the repository
 */
export async function findPRTemplate(repoRoot: string): Promise<string | null> {
  for (const templatePath of TEMPLATE_PATHS) {
    const fullPath = join(repoRoot, templatePath);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Parse a PR template into sections
 */
export function parsePRTemplate(content: string): PRTemplate {
  const sections: PRTemplateSection[] = [];
  const lines = content.split('\n');

  let currentSection: PRTemplateSection | null = null;
  let titleLine: string | undefined;

  // Check for title in first line
  if (lines[0]?.startsWith('# ')) {
    titleLine = lines[0].replace(/^#\s*/, '').trim();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect heading (## Section Name)
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentSection.content.trim();
        sections.push(currentSection);
      }

      // Start new section
      const sectionName = headingMatch[1].trim();
      currentSection = {
        name: normalizeSectionName(sectionName),
        header: sectionName,
        content: '',
        type: 'text',
        required: false,
      };
      continue;
    }

    // Detect section type and accumulate content
    if (currentSection) {
      // Check for checklist items
      if (line.match(/^-\s*\[[ x]\]/i)) {
        currentSection.type = 'checklist';
      }
      // Check for bullet list
      else if (line.match(/^-\s+[^[]/) && currentSection.type !== 'checklist') {
        currentSection.type = 'list';
      }

      currentSection.content += line + '\n';
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.content = currentSection.content.trim();
    sections.push(currentSection);
  }

  return {
    path: '',
    raw: content,
    title: titleLine,
    sections,
  };
}

/**
 * Normalize section names for matching
 */
function normalizeSectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

/**
 * Load and parse a PR template
 */
export async function loadPRTemplate(repoRoot: string): Promise<PRTemplate | null> {
  const templatePath = await findPRTemplate(repoRoot);

  if (!templatePath) {
    return null;
  }

  try {
    const content = await readFile(templatePath, 'utf-8');
    const template = parsePRTemplate(content);
    template.path = templatePath;
    return template;
  } catch {
    return null;
  }
}

/**
 * Section mappings for AI to fill
 */
export interface PRSectionMappings {
  description?: string;
  type_of_change?: string;
  impact?: string;
  testing?: string;
  additional?: string;
  jira_ticket?: string;
  breaking_changes?: string;
  screenshots?: string;
  checklist?: string[];
}

/**
 * Fill a template with AI-generated content
 */
export function fillTemplate(
  template: PRTemplate,
  content: {
    title: string;
    description: string;
    type: string;
    impact: string;
    testing: string;
    ticketIds: string[];
    ticketLinks: { id: string; url: string }[];
    breakingChanges?: string;
    additionalInfo?: string;
  }
): string {
  let result = '';

  // Add title if template has one
  if (template.title) {
    result += `# ${content.title}\n\n`;
  }

  for (const section of template.sections) {
    result += `## ${section.header}\n\n`;

    const sectionKey = section.name.toLowerCase();

    // Match section to content
    if (sectionKey.includes('description') || sectionKey.includes('what')) {
      result += content.description + '\n\n';
    } else if (sectionKey.includes('type') || sectionKey.includes('change')) {
      result += formatTypeOfChange(content.type, section.content) + '\n\n';
    } else if (
      sectionKey.includes('jira') ||
      sectionKey.includes('ticket') ||
      sectionKey.includes('issue')
    ) {
      result += formatTicketSection(content.ticketIds, content.ticketLinks) + '\n\n';
    } else if (sectionKey.includes('impact')) {
      result += content.impact + '\n\n';
    } else if (sectionKey.includes('test') || sectionKey.includes('how_to')) {
      result += content.testing + '\n\n';
    } else if (sectionKey.includes('breaking')) {
      result += (content.breakingChanges || 'No breaking changes.') + '\n\n';
    } else if (sectionKey.includes('additional') || sectionKey.includes('notes')) {
      result += (content.additionalInfo || 'No additional information.') + '\n\n';
    } else if (sectionKey.includes('screenshot')) {
      result += '_Screenshots will be added if applicable._\n\n';
    } else if (section.type === 'checklist') {
      // Keep checklist as-is
      result += section.content + '\n\n';
    } else {
      // For unknown sections, keep original content or add placeholder
      result += section.content || '_To be filled._\n\n';
    }
  }

  return result.trim();
}

/**
 * Format type of change section with checkmarks
 */
function formatTypeOfChange(type: string, originalContent: string): string {
  const typeMap: Record<string, string[]> = {
    feat: ['feature', 'new feature', '🚀'],
    fix: ['bug', 'bug fix', '🪲'],
    docs: ['documentation', 'doc', '📈'],
    refactor: ['refactor', '🛠️'],
    hotfix: ['hotfix', '🐦‍🔥'],
    security: ['security', '🔐'],
    style: ['ui', 'ux', '✨', 'style'],
    chore: ['chore', 'maintenance'],
    test: ['test', 'testing'],
  };

  // Find matching keywords for the type
  const keywords = typeMap[type.toLowerCase()] || [];

  // Parse original checklist and mark the appropriate one
  const lines = originalContent.split('\n');
  const result = lines.map((line) => {
    const isChecklist = line.match(/^-\s*\[[ x]\]/i);
    if (!isChecklist) return line;

    const lineContent = line.toLowerCase();
    const shouldCheck = keywords.some((kw) => lineContent.includes(kw.toLowerCase()));

    if (shouldCheck) {
      return line.replace(/\[[ ]\]/, '[x]');
    }
    return line.replace(/\[x\]/i, '[ ]');
  });

  return result.join('\n');
}

/**
 * Format ticket section
 */
function formatTicketSection(
  ticketIds: string[],
  ticketLinks: { id: string; url: string }[]
): string {
  if (ticketIds.length === 0) {
    return '**Ticket No:** N/A\n\n**Ticket link:** N/A';
  }

  const lines: string[] = [];

  for (const id of ticketIds) {
    const link = ticketLinks.find((t) => t.id === id);
    if (link) {
      lines.push(`**Ticket No:** ${id}`);
      lines.push(`**Ticket link:** ${link.url}`);
    } else {
      lines.push(`**Ticket No:** ${id}`);
    }
  }

  return lines.join('\n\n');
}

/**
 * Get default PR template (used when no template exists)
 */
export function getDefaultTemplate(): string {
  return `## What Changed

[Description of changes]

## Why

[Business or technical reason for these changes]

## How to Test

1. [Testing step 1]
2. [Testing step 2]

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
`;
}
