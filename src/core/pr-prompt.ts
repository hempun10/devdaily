/**
 * Custom PR Description Prompt Loader
 *
 * Loads a custom prompt file (like CLAUDE.md but for PR descriptions)
 * that teams can use to customize how AI generates PR descriptions.
 *
 * Search order:
 *   1. Path specified in config (`pr.promptFile`)
 *   2. `.devdaily-pr-prompt.md` in repo root
 *   3. `.github/devdaily-pr-prompt.md`
 *   4. `.github/PR_DESCRIPTION_PROMPT.md`
 *   5. `docs/devdaily-pr-prompt.md`
 *
 * The file content is injected into the AI prompt as "team guidelines"
 * so the AI follows repo-specific rules for tone, format, sections, etc.
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { getConfig } from '../config/index.js';

export interface PRPromptConfig {
  /** The raw markdown content of the prompt file */
  raw: string;
  /** The path where the prompt file was found */
  path: string;
  /** Parsed guidelines (if structured with headings) */
  guidelines: PRGuideline[];
}

export interface PRGuideline {
  /** Section heading */
  heading: string;
  /** Section content */
  content: string;
}

/**
 * Common prompt file locations (in order of precedence)
 */
const PROMPT_FILE_PATHS = [
  '.devdaily-pr-prompt.md',
  '.github/devdaily-pr-prompt.md',
  '.github/PR_DESCRIPTION_PROMPT.md',
  'docs/devdaily-pr-prompt.md',
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
 * Find the PR prompt file in the repository
 */
export async function findPRPromptFile(repoRoot: string): Promise<string | null> {
  const config = getConfig();

  // 1. Check config-specified path first
  const configPath = config.pr.promptFile;
  if (configPath) {
    const fullPath = configPath.startsWith('/') ? configPath : join(repoRoot, configPath);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  // 2. Check standard locations
  for (const promptPath of PROMPT_FILE_PATHS) {
    const fullPath = join(repoRoot, promptPath);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Parse the prompt file into structured guidelines
 */
export function parsePRPrompt(content: string): PRGuideline[] {
  const guidelines: PRGuideline[] = [];

  // Normalize line endings (Windows \r\n → \n)
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let currentHeading: string | null = null;
  let currentContent: string[] = [];
  let insideCodeBlock = false;

  for (const line of lines) {
    // Track fenced code blocks so we don't treat headings inside them as real headings
    if (line.trimEnd().startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
      if (currentHeading !== null) {
        currentContent.push(line);
      }
      continue;
    }

    // Only match headings (h1–h3) when NOT inside a code block
    const headingMatch = !insideCodeBlock ? line.match(/^#{1,3}\s+(.+)$/) : null;

    if (headingMatch) {
      // Save previous section
      if (currentHeading !== null) {
        guidelines.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
    } else if (currentHeading !== null) {
      currentContent.push(line);
    } else {
      // Content before any heading — treat as a "General" section
      if (line.trim()) {
        if (!currentHeading) {
          currentHeading = 'General';
        }
        currentContent.push(line);
      }
    }
  }

  // Don't forget the last section
  if (currentHeading !== null) {
    guidelines.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return guidelines;
}

/**
 * Load and parse the PR prompt file
 */
export async function loadPRPrompt(repoRoot: string): Promise<PRPromptConfig | null> {
  const promptPath = await findPRPromptFile(repoRoot);

  if (!promptPath) {
    return null;
  }

  try {
    const content = await readFile(promptPath, 'utf-8');
    const guidelines = parsePRPrompt(content);

    return {
      raw: content,
      path: promptPath,
      guidelines,
    };
  } catch {
    return null;
  }
}

/**
 * Format the PR prompt config into a string suitable for injection into the AI prompt.
 * This produces a clearly delineated block that tells the AI to follow these rules.
 */
export function formatPRPromptForAI(promptConfig: PRPromptConfig): string {
  const lines: string[] = [
    '',
    '=== TEAM PR DESCRIPTION GUIDELINES (follow these strictly) ===',
    '',
  ];

  if (promptConfig.guidelines.length > 0) {
    for (const guideline of promptConfig.guidelines) {
      lines.push(`### ${guideline.heading}`);
      if (guideline.content) {
        lines.push(guideline.content);
      }
      lines.push('');
    }
  } else {
    // No structured guidelines — just include the raw content
    lines.push(promptConfig.raw);
    lines.push('');
  }

  lines.push('=== END TEAM GUIDELINES ===');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a sample PR prompt file that teams can customize
 */
export function generateSamplePRPrompt(): string {
  return `# PR Description Guidelines

These guidelines tell DevDaily AI how to generate PR descriptions for your team.
Customize this file to match your team's conventions.

## Tone & Style

- Write in a professional but approachable tone
- Be concise — aim for clarity over verbosity
- Use bullet points for lists of changes
- Avoid jargon unless it's well-known in the team
- No emojis in the description body (section headers are fine)

## Description Format

- Start with a one-sentence summary of what the PR does
- Follow with bullet points of specific changes
- Group related changes together
- Mention any architectural decisions or trade-offs

## Ticket References

- Always include ticket IDs (e.g., PROJ-123) when available
- Link to the ticket URL when possible
- Explain how the changes relate to the ticket's acceptance criteria

## Testing Instructions

- Provide step-by-step instructions for reviewers to test
- Include any required environment setup
- Mention edge cases that should be verified
- Include expected vs actual behavior for bug fixes

## Breaking Changes

- Clearly call out any breaking changes
- Explain migration steps if applicable
- Tag breaking changes with a warning

## What NOT to Include

- Don't list every file changed (that's in the diff)
- Don't repeat commit messages verbatim
- Don't include implementation details that are obvious from the code
- Don't include TODOs — create follow-up tickets instead
`;
}

/**
 * Get the default path where a new PR prompt file should be created
 */
export function getDefaultPRPromptPath(repoRoot: string): string {
  return join(repoRoot, '.devdaily-pr-prompt.md');
}
