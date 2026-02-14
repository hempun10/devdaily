/**
 * Output formatter — converts AI-generated markdown to other output formats.
 *
 * Supported formats:
 *   - markdown (passthrough)
 *   - plain   (strip all markdown syntax)
 *   - slack   (convert to Slack mrkdwn)
 *   - json    (structured JSON object)
 */

export type OutputFormat = 'markdown' | 'slack' | 'plain' | 'json';

export interface FormattedOutput {
  /** The transformed text ready for display / clipboard */
  text: string;
  /** The original markdown (always kept) */
  raw: string;
  /** Which format was applied */
  format: OutputFormat;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Format standup / PR / weekly text into the requested output format.
 */
export function formatOutput(
  markdown: string,
  format: OutputFormat = 'markdown',
  meta?: {
    title?: string;
    commits?: number;
    prs?: number;
    tickets?: number;
    days?: number;
    branch?: string;
    repo?: string;
  }
): FormattedOutput {
  switch (format) {
    case 'plain':
      return { text: toPlain(markdown), raw: markdown, format };
    case 'slack':
      return { text: toSlack(markdown), raw: markdown, format };
    case 'json':
      return { text: toJSON(markdown, meta), raw: markdown, format };
    case 'markdown':
    default:
      return { text: markdown, raw: markdown, format };
  }
}

/**
 * Validate that a string is a supported output format.
 * Returns the validated format or the fallback.
 */
export function validateFormat(value: string, fallback: OutputFormat = 'markdown'): OutputFormat {
  const valid: OutputFormat[] = ['markdown', 'slack', 'plain', 'json'];
  if (valid.includes(value as OutputFormat)) {
    return value as OutputFormat;
  }
  return fallback;
}

// ─── Converters ───────────────────────────────────────────────────────────────

/**
 * Strip markdown syntax and return plain text.
 */
function toPlain(md: string): string {
  let text = md;

  // Remove horizontal rules (---, ***, ___)
  text = text.replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '');

  // Convert headers to plain text with a colon suffix
  // e.g. "## In Progress" → "In Progress:"
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading: string) => {
    const cleaned = heading.trim();
    // Don't add colon if it already ends with punctuation
    if (/[.:!?]$/.test(cleaned)) {
      return cleaned;
    }
    return `${cleaned}:`;
  });

  // Bold: **text** or __text__ → text
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');

  // Italic: *text* or _text_ → text
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');
  text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1');

  // Strikethrough: ~~text~~ → text
  text = text.replace(/~~(.+?)~~/g, '$1');

  // Inline code: `code` → code
  text = text.replace(/`([^`]+)`/g, '$1');

  // Code blocks: ```lang\ncode\n``` → code
  text = text.replace(/```[\s\S]*?\n([\s\S]*?)```/g, '$1');

  // Links: [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Images: ![alt](url) → [Image: alt]
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[Image: $1]');

  // Unordered list markers: - item or * item → • item
  text = text.replace(/^[ \t]*[-*]\s+/gm, '• ');

  // Ordered list markers are fine as-is (1. item)

  // Blockquotes: > text → text
  text = text.replace(/^>+\s?/gm, '');

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Convert markdown to Slack mrkdwn format.
 *
 * Key differences from standard markdown:
 *   - Bold:       **text**  → *text*
 *   - Italic:     *text*    → _text_
 *   - Strike:     ~~text~~  → ~text~
 *   - Links:      [t](url)  → <url|t>
 *   - Headers:    ## Foo    → *Foo*
 *   - Code block: ```       → ``` (same, but no language tag)
 *   - Lists:      - item    → • item
 */
function toSlack(md: string): string {
  let text = md;

  // Use Unicode private-use area chars as safe placeholder delimiters
  // so they won't be matched by bold/italic/underscore regexes.
  const PH_START = '\uE000';
  const PH_END = '\uE001';

  // Code blocks first (protect from other transforms).
  // Strip the language identifier after ```.
  const codeBlocks: string[] = [];
  text = text.replace(/```\w*\n([\s\S]*?)```/g, (_match, code: string) => {
    const placeholder = `${PH_START}CB${codeBlocks.length}${PH_END}`;
    codeBlocks.push('```\n' + code + '```');
    return placeholder;
  });

  // Inline code — leave as-is (Slack supports `code`)
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    const placeholder = `${PH_START}IC${inlineCodes.length}${PH_END}`;
    inlineCodes.push('`' + code + '`');
    return placeholder;
  });

  // Images → just the URL
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<$2|$1>');

  // Links: [text](url) → <url|text>
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Italic first: convert single *text* → _text_ BEFORE we collapse **text**
  // This way, double-asterisk bold won't be partially eaten by the italic pass.
  // Match single asterisks that are NOT adjacent to another asterisk.
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_');

  // Bold: **text** → *text*  (Slack uses single asterisk for bold)
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // __text__ bold (underscore variant) — also convert to Slack bold *text*
  // Use a regex that won't match our safe placeholders (which use PH_START/PH_END)
  text = text.replace(/(?<!\uE000)__(.+?)__(?!\uE001)/g, '*$1*');

  // Headers → bold in Slack (## Foo → *Foo*)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // Strikethrough: ~~text~~ → ~text~
  text = text.replace(/~~(.+?)~~/g, '~$1~');

  // Unordered list markers
  text = text.replace(/^[ \t]*[-*]\s+/gm, '• ');

  // Blockquotes: > text → > text (Slack supports this natively)
  // Leave as-is

  // Horizontal rules → divider-like text
  text = text.replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '───────────────────────');

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`${PH_START}CB${i}${PH_END}`, codeBlocks[i]);
  }

  // Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    text = text.replace(`${PH_START}IC${i}${PH_END}`, inlineCodes[i]);
  }

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Convert markdown standup to a structured JSON string.
 */
function toJSON(
  md: string,
  meta?: {
    title?: string;
    commits?: number;
    prs?: number;
    tickets?: number;
    days?: number;
    branch?: string;
    repo?: string;
  }
): string {
  const sections = parseSections(md);

  const output: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
  };

  if (meta) {
    output.meta = { ...meta };
  }

  output.sections = sections;
  output.raw = md;

  return JSON.stringify(output, null, 2);
}

// ─── Section parser ───────────────────────────────────────────────────────────

interface Section {
  heading: string;
  level: number;
  items: string[];
  body: string;
}

/**
 * Parse markdown into sections keyed by heading.
 */
function parseSections(md: string): Section[] {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  let bodyLines: string[] = [];

  const flushCurrent = () => {
    if (current) {
      current.body = bodyLines.join('\n').trim();
      current.items = extractListItems(current.body);
      sections.push(current);
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushCurrent();
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        items: [],
        body: '',
      };
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }

  // Flush last section
  flushCurrent();

  // If there were no headings at all, treat the whole thing as one section
  if (sections.length === 0 && md.trim().length > 0) {
    const body = md.trim();
    sections.push({
      heading: 'Content',
      level: 0,
      items: extractListItems(body),
      body,
    });
  }

  return sections;
}

/**
 * Extract bullet / numbered list items from a body of text.
 */
function extractListItems(body: string): string[] {
  const items: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^[ \t]*(?:[-*]|\d+[.)]) \s*(.+)$/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  return items;
}
