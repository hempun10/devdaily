/**
 * Tests for notification integrations (Slack & Discord webhooks)
 * and output formatter (--format flag).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatStandupNotification,
  formatPRNotification,
  formatWeeklyNotification,
  sendToSlack,
  sendToDiscord,
  sendNotification,
} from '../src/core/notifications.js';
import { formatOutput, validateFormat } from '../src/utils/formatter.js';

// ─── Mock config / secrets ────────────────────────────────────────────────────

const mockConfig = {
  notifications: {
    slack: { enabled: false, webhookUrl: undefined, channel: undefined },
    discord: { enabled: false, webhookUrl: undefined },
    standupTimezone: 'America/New_York',
  },
};

const mockSecrets = {
  slack: { webhookUrl: undefined as string | undefined },
  discord: { webhookUrl: undefined as string | undefined },
};

vi.mock('../src/config/index.js', () => ({
  getConfig: () => mockConfig,
  getSecrets: () => mockSecrets,
  ConfigManager: {
    getInstance: () => ({
      get: () => mockConfig,
      getSecrets: () => mockSecrets,
    }),
  },
  config: {
    get: () => mockConfig,
    getSecrets: () => mockSecrets,
  },
}));

// ─── Global fetch mock ────────────────────────────────────────────────────────

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  // Reset secrets
  mockSecrets.slack = { webhookUrl: undefined };
  mockSecrets.discord = { webhookUrl: undefined };
  mockConfig.notifications.slack = { enabled: false, webhookUrl: undefined, channel: undefined };
  mockConfig.notifications.discord = { enabled: false, webhookUrl: undefined };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATION FORMATTING
// ═════════════════════════════════════════════════════════════════════════════

describe('Notification message formatting', () => {
  describe('formatStandupNotification', () => {
    it('creates a standup notification with title and type', () => {
      const msg = formatStandupNotification('Did some work today');
      expect(msg.title).toBe('Daily Standup');
      expect(msg.text).toBe('Did some work today');
      expect(msg.type).toBe('standup');
    });

    it('includes ticket links when provided', () => {
      const tickets = [
        { id: 'PROJ-123', url: 'https://jira.example.com/PROJ-123', title: 'Fix bug' },
        { id: 'PROJ-456', url: 'https://jira.example.com/PROJ-456' },
      ];
      const msg = formatStandupNotification('Work done', tickets);
      expect(msg.ticketLinks).toHaveLength(2);
      expect(msg.ticketLinks![0].id).toBe('PROJ-123');
      expect(msg.ticketLinks![0].title).toBe('Fix bug');
      expect(msg.ticketLinks![1].title).toBeUndefined();
    });

    it('handles undefined tickets gracefully', () => {
      const msg = formatStandupNotification('Work done');
      expect(msg.ticketLinks).toBeUndefined();
    });
  });

  describe('formatPRNotification', () => {
    it('creates a PR notification', () => {
      const msg = formatPRNotification(
        'Add authentication',
        'https://github.com/org/repo/pull/42',
        'Implemented JWT auth flow'
      );
      expect(msg.title).toBe('New PR: Add authentication');
      expect(msg.type).toBe('pr');
      expect(msg.text).toContain('Implemented JWT auth flow');
      expect(msg.text).toContain('https://github.com/org/repo/pull/42');
    });
  });

  describe('formatWeeklyNotification', () => {
    it('creates a weekly summary notification', () => {
      const msg = formatWeeklyNotification('Great week of work');
      expect(msg.title).toBe('Weekly Summary');
      expect(msg.type).toBe('weekly');
      expect(msg.text).toBe('Great week of work');
    });

    it('includes stats in footer when provided', () => {
      const msg = formatWeeklyNotification('Summary text', { commits: 42, prs: 5 });
      expect(msg.footer).toContain('42 commits');
      expect(msg.footer).toContain('5 PRs');
    });

    it('handles stats without PRs', () => {
      const msg = formatWeeklyNotification('Summary', { commits: 10 });
      expect(msg.footer).toContain('10 commits');
      expect(msg.footer).not.toContain('PRs');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SLACK WEBHOOK
// ═════════════════════════════════════════════════════════════════════════════

describe('Slack webhook integration', () => {
  const SLACK_WEBHOOK = 'https://hooks.slack.com/services/T00/B00/xxx';

  it('sends a message to Slack with correct payload structure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await sendToSlack(
      { title: 'Daily Standup', text: 'Did stuff', type: 'standup' },
      SLACK_WEBHOOK
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SLACK_WEBHOOK);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.blocks).toBeDefined();
    expect(Array.isArray(body.blocks)).toBe(true);

    // Should have a header block with the title
    const headerBlock = body.blocks.find((b: { type: string }) => b.type === 'header');
    expect(headerBlock).toBeDefined();
    expect(headerBlock.text.text).toContain('Daily Standup');

    // Should have a section block with the text
    const sectionBlock = body.blocks.find((b: { type: string }) => b.type === 'section');
    expect(sectionBlock).toBeDefined();
    expect(sectionBlock.text.text).toBe('Did stuff');
  });

  it('includes ticket links in Slack message', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendToSlack(
      {
        title: 'Standup',
        text: 'Work',
        type: 'standup',
        ticketLinks: [{ id: 'PROJ-1', url: 'https://jira.example.com/PROJ-1', title: 'Fix login' }],
      },
      SLACK_WEBHOOK
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const ticketSection = body.blocks.find(
      (b: { type: string; text?: { text: string } }) =>
        b.type === 'section' && b.text?.text?.includes('Related Tickets')
    );
    expect(ticketSection).toBeDefined();
    expect(ticketSection.text.text).toContain('PROJ-1');
    expect(ticketSection.text.text).toContain('Fix login');
  });

  it('includes a context footer block', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendToSlack({ text: 'Hello', type: 'info' }, SLACK_WEBHOOK);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const contextBlock = body.blocks.find((b: { type: string }) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    expect(contextBlock.elements[0].text).toContain('DevDaily');
  });

  it('uses custom footer when provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendToSlack({ text: 'Hello', footer: 'Custom footer text' }, SLACK_WEBHOOK);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const contextBlock = body.blocks.find((b: { type: string }) => b.type === 'context');
    expect(contextBlock.elements[0].text).toBe('Custom footer text');
  });

  it('throws when no webhook URL is configured', async () => {
    await expect(sendToSlack({ text: 'Hello' })).rejects.toThrow(
      /Slack webhook URL not configured/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses webhook URL from secrets when not passed directly', async () => {
    mockSecrets.slack = { webhookUrl: SLACK_WEBHOOK };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await sendToSlack({ text: 'From secrets' });
    expect(result).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(SLACK_WEBHOOK);
  });

  it('uses webhook URL from config when not in secrets', async () => {
    mockConfig.notifications.slack = {
      enabled: true,
      webhookUrl: SLACK_WEBHOOK,
      channel: undefined,
    };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await sendToSlack({ text: 'From config' });
    expect(result).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(SLACK_WEBHOOK);
  });

  it('throws on non-OK response from Slack API', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

    await expect(sendToSlack({ text: 'Should fail' }, SLACK_WEBHOOK)).rejects.toThrow(
      /Slack API error: 403/
    );
  });

  it('throws on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(sendToSlack({ text: 'Network fail' }, SLACK_WEBHOOK)).rejects.toThrow(
      /Failed to send Slack message/
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DISCORD WEBHOOK
// ═════════════════════════════════════════════════════════════════════════════

describe('Discord webhook integration', () => {
  const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/123456/abc';

  it('sends a message to Discord with correct embed structure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await sendToDiscord(
      { title: 'Daily Standup', text: 'Did stuff', type: 'standup' },
      DISCORD_WEBHOOK
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DISCORD_WEBHOOK);
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.username).toBe('DevDaily');
    expect(body.embeds).toBeDefined();
    expect(body.embeds).toHaveLength(1);

    const embed = body.embeds[0];
    expect(embed.title).toContain('Daily Standup');
    expect(embed.description).toBe('Did stuff');
    expect(embed.color).toBeDefined();
    expect(embed.timestamp).toBeDefined();
    expect(embed.footer.text).toContain('DevDaily');
  });

  it('uses correct color for standup type (green)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await sendToDiscord({ text: 'Test', type: 'standup' }, DISCORD_WEBHOOK);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x4ade80);
  });

  it('uses correct color for PR type (blue)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await sendToDiscord({ text: 'Test', type: 'pr' }, DISCORD_WEBHOOK);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x60a5fa);
  });

  it('uses correct color for weekly type (purple)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await sendToDiscord({ text: 'Test', type: 'weekly' }, DISCORD_WEBHOOK);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0xa78bfa);
  });

  it('includes ticket links as embed fields', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await sendToDiscord(
      {
        text: 'Work',
        type: 'standup',
        ticketLinks: [
          { id: 'PROJ-1', url: 'https://jira.example.com/PROJ-1', title: 'Fix login' },
          { id: 'PROJ-2', url: 'https://jira.example.com/PROJ-2' },
        ],
      },
      DISCORD_WEBHOOK
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const fields = body.embeds[0].fields;
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('PROJ-1');
    expect(fields[0].value).toContain('Fix login');
    expect(fields[1].name).toBe('PROJ-2');
    expect(fields[1].value).toContain('View Ticket');
  });

  it('throws when no webhook URL is configured', async () => {
    await expect(sendToDiscord({ text: 'Hello' })).rejects.toThrow(
      /Discord webhook URL not configured/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses webhook URL from secrets when not passed directly', async () => {
    mockSecrets.discord = { webhookUrl: DISCORD_WEBHOOK };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await sendToDiscord({ text: 'From secrets' });
    expect(result).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(DISCORD_WEBHOOK);
  });

  it('throws on non-OK response from Discord API', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(sendToDiscord({ text: 'Should fail' }, DISCORD_WEBHOOK)).rejects.toThrow(
      /Discord API error: 401/
    );
  });

  it('throws on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));

    await expect(sendToDiscord({ text: 'Network fail' }, DISCORD_WEBHOOK)).rejects.toThrow(
      /Failed to send Discord message/
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// sendNotification (combined sender)
// ═════════════════════════════════════════════════════════════════════════════

describe('sendNotification (combined)', () => {
  const SLACK_WEBHOOK = 'https://hooks.slack.com/services/T00/B00/xxx';
  const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/123456/abc';

  it('sends to both Slack and Discord when both requested', async () => {
    mockSecrets.slack = { webhookUrl: SLACK_WEBHOOK };
    mockSecrets.discord = { webhookUrl: DISCORD_WEBHOOK };
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const results = await sendNotification(
      { text: 'Test', type: 'standup' },
      { slack: true, discord: true }
    );

    expect(results.slack).toBe(true);
    expect(results.discord).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends only to Slack when discord is false', async () => {
    mockSecrets.slack = { webhookUrl: SLACK_WEBHOOK };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const results = await sendNotification({ text: 'Test' }, { slack: true, discord: false });

    expect(results.slack).toBe(true);
    expect(results.discord).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends only to Discord when slack is false', async () => {
    mockSecrets.discord = { webhookUrl: DISCORD_WEBHOOK };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    const results = await sendNotification({ text: 'Test' }, { slack: false, discord: true });

    expect(results.slack).toBeUndefined();
    expect(results.discord).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses config.notifications.*.enabled when no explicit options', async () => {
    mockConfig.notifications.slack = {
      enabled: true,
      webhookUrl: SLACK_WEBHOOK,
      channel: undefined,
    };
    mockConfig.notifications.discord = { enabled: false, webhookUrl: undefined };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const results = await sendNotification({ text: 'Test' });

    expect(results.slack).toBe(true);
    expect(results.discord).toBeUndefined();
  });

  it('returns false (not throw) when a channel fails', async () => {
    mockSecrets.slack = { webhookUrl: SLACK_WEBHOOK };
    mockSecrets.discord = { webhookUrl: DISCORD_WEBHOOK };

    // Slack succeeds, Discord fails
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const results = await sendNotification({ text: 'Test' }, { slack: true, discord: true });

    expect(results.slack).toBe(true);
    expect(results.discord).toBe(false);
  });

  it('returns empty object when neither channel is enabled', async () => {
    const results = await sendNotification({ text: 'Test' });
    expect(results).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// OUTPUT FORMATTER
// ═════════════════════════════════════════════════════════════════════════════

describe('Output formatter', () => {
  describe('validateFormat', () => {
    it('accepts valid formats', () => {
      expect(validateFormat('markdown')).toBe('markdown');
      expect(validateFormat('slack')).toBe('slack');
      expect(validateFormat('plain')).toBe('plain');
      expect(validateFormat('json')).toBe('json');
    });

    it('returns fallback for invalid formats', () => {
      expect(validateFormat('html')).toBe('markdown');
      expect(validateFormat('')).toBe('markdown');
      expect(validateFormat('MARKDOWN')).toBe('markdown'); // case-sensitive
    });

    it('accepts a custom fallback', () => {
      expect(validateFormat('invalid', 'plain')).toBe('plain');
    });
  });

  describe('formatOutput — markdown (passthrough)', () => {
    it('returns the input unchanged', () => {
      const md = '## Hello\n\n- item 1\n- item 2';
      const result = formatOutput(md, 'markdown');

      expect(result.text).toBe(md);
      expect(result.raw).toBe(md);
      expect(result.format).toBe('markdown');
    });

    it('defaults to markdown when format is undefined', () => {
      const md = '# Title';
      const result = formatOutput(md);
      expect(result.format).toBe('markdown');
      expect(result.text).toBe(md);
    });
  });

  describe('formatOutput — plain', () => {
    it('strips header markers and adds colons', () => {
      const md = '## Completed\n\nDid stuff';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('Completed:');
      expect(result.text).not.toContain('##');
    });

    it('does not add colon if heading ends with punctuation', () => {
      const md = '## What did you do?';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('What did you do?');
      expect(result.text).not.toContain('What did you do?:');
    });

    it('strips bold markers', () => {
      const md = 'This is **bold** and __also bold__';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('This is bold and also bold');
      expect(result.text).not.toContain('**');
      expect(result.text).not.toContain('__');
    });

    it('strips inline code backticks', () => {
      const md = 'Fixed `calculateTotal` function';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('Fixed calculateTotal function');
      expect(result.text).not.toContain('`');
    });

    it('converts markdown links to plain text with URL', () => {
      const md = 'See [the docs](https://example.com)';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('the docs (https://example.com)');
    });

    it('converts unordered list markers to bullet points', () => {
      const md = '- item one\n- item two\n* item three';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('• item one');
      expect(result.text).toContain('• item two');
      expect(result.text).toContain('• item three');
    });

    it('strips blockquote markers', () => {
      const md = '> This is a quote\n> With two lines';
      const result = formatOutput(md, 'plain');

      expect(result.text).toContain('This is a quote');
      expect(result.text).not.toMatch(/^>/m);
    });

    it('removes horizontal rules', () => {
      const md = 'Above\n\n---\n\nBelow';
      const result = formatOutput(md, 'plain');

      expect(result.text).not.toContain('---');
      expect(result.text).toContain('Above');
      expect(result.text).toContain('Below');
    });

    it('collapses multiple blank lines', () => {
      const md = 'Line 1\n\n\n\n\nLine 2';
      const result = formatOutput(md, 'plain');

      expect(result.text).not.toMatch(/\n{3,}/);
    });

    it('preserves the raw markdown in .raw', () => {
      const md = '## Title\n\n**Bold text**';
      const result = formatOutput(md, 'plain');

      expect(result.raw).toBe(md);
      expect(result.raw).toContain('##');
      expect(result.raw).toContain('**');
    });
  });

  describe('formatOutput — slack', () => {
    it('converts headers to Slack bold', () => {
      const md = '## Completed Tasks';
      const result = formatOutput(md, 'slack');

      expect(result.text).toBe('*Completed Tasks*');
    });

    it('converts bold syntax to Slack bold', () => {
      const md = 'This is **important** work';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('*important*');
      expect(result.text).not.toContain('**');
    });

    it('converts markdown links to Slack format', () => {
      const md = '[View PR](https://github.com/org/repo/pull/1)';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('<https://github.com/org/repo/pull/1|View PR>');
    });

    it('converts unordered list markers to bullets', () => {
      const md = '- task one\n- task two';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('• task one');
      expect(result.text).toContain('• task two');
    });

    it('converts horizontal rules to visual dividers', () => {
      const md = '---';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('───');
    });

    it('strips language identifiers from code blocks', () => {
      const md = '```typescript\nconst x = 1;\n```';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('```\nconst x = 1;\n```');
      expect(result.text).not.toContain('typescript');
    });

    it('preserves inline code', () => {
      const md = 'Fixed the `login` handler';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('`login`');
    });

    it('converts strikethrough to Slack format', () => {
      const md = '~~removed feature~~';
      const result = formatOutput(md, 'slack');

      expect(result.text).toContain('~removed feature~');
      expect(result.text).not.toContain('~~');
    });
  });

  describe('formatOutput — json', () => {
    it('returns valid JSON', () => {
      const md = '## Completed\n\n- Did thing A\n- Did thing B';
      const result = formatOutput(md, 'json');

      expect(() => JSON.parse(result.text)).not.toThrow();
    });

    it('includes generatedAt timestamp', () => {
      const result = formatOutput('## Test', 'json');
      const parsed = JSON.parse(result.text);

      expect(parsed.generatedAt).toBeDefined();
      expect(new Date(parsed.generatedAt).getTime()).not.toBeNaN();
    });

    it('includes metadata when provided', () => {
      const result = formatOutput('## Test', 'json', {
        title: 'Daily Standup',
        commits: 5,
        prs: 2,
        tickets: 1,
        days: 1,
        branch: 'feature/auth',
        repo: 'org/repo',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.meta.title).toBe('Daily Standup');
      expect(parsed.meta.commits).toBe(5);
      expect(parsed.meta.prs).toBe(2);
      expect(parsed.meta.tickets).toBe(1);
      expect(parsed.meta.branch).toBe('feature/auth');
      expect(parsed.meta.repo).toBe('org/repo');
    });

    it('parses sections from markdown headings', () => {
      const md = '## Completed\n\n- Task A\n- Task B\n\n## In Progress\n\n- Task C';
      const result = formatOutput(md, 'json');
      const parsed = JSON.parse(result.text);

      expect(parsed.sections).toBeDefined();
      expect(parsed.sections.length).toBeGreaterThanOrEqual(2);

      const completed = parsed.sections.find((s: { heading: string }) => s.heading === 'Completed');
      expect(completed).toBeDefined();
      expect(completed.items).toContain('Task A');
      expect(completed.items).toContain('Task B');

      const inProgress = parsed.sections.find(
        (s: { heading: string }) => s.heading === 'In Progress'
      );
      expect(inProgress).toBeDefined();
      expect(inProgress.items).toContain('Task C');
    });

    it('includes raw markdown in the output', () => {
      const md = '## Title\n\n- item';
      const result = formatOutput(md, 'json');
      const parsed = JSON.parse(result.text);

      expect(parsed.raw).toBe(md);
    });

    it('handles content with no headings', () => {
      const md = 'Just some plain text with no headings.';
      const result = formatOutput(md, 'json');
      const parsed = JSON.parse(result.text);

      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].heading).toBe('Content');
      expect(parsed.sections[0].body).toContain('Just some plain text');
    });

    it('omits meta field when not provided', () => {
      const result = formatOutput('## Test', 'json');
      const parsed = JSON.parse(result.text);

      expect(parsed.meta).toBeUndefined();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CLIPBOARD + FORMAT INTEGRATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Format + clipboard integration logic', () => {
  it('plain format output is suitable for clipboard (no markdown noise)', () => {
    const md =
      '## Completed\n\n- **Fixed** the `login` bug ([PR #42](https://github.com/x/y/pull/42))\n- Reviewed **auth** module\n\n---\n\n## Blockers\n\n- Waiting on API team';
    const result = formatOutput(md, 'plain');

    // Should be clean text
    expect(result.text).not.toContain('##');
    expect(result.text).not.toContain('**');
    expect(result.text).not.toContain('`');
    expect(result.text).not.toContain('---');
    expect(result.text).toContain('Completed:');
    expect(result.text).toContain('Fixed');
    expect(result.text).toContain('login');
    expect(result.text).toContain('PR #42');
    expect(result.text).toContain('Blockers:');
  });

  it('slack format output is ready for pasting into Slack', () => {
    const md =
      '## Completed\n\n- **Fixed** the login bug\n- Updated docs\n\n## In Progress\n\n- Working on auth';
    const result = formatOutput(md, 'slack');

    // Slack bold uses single asterisk
    expect(result.text).toContain('*Completed*');
    expect(result.text).toContain('*Fixed*');
    expect(result.text).toContain('*In Progress*');
    // Bullets
    expect(result.text).toContain('•');
  });

  it('json format produces parseable output for automation', () => {
    const md = '## Done\n\n- Shipped feature X\n\n## Next\n\n- Start feature Y';
    const result = formatOutput(md, 'json', {
      commits: 10,
      days: 1,
    });

    const parsed = JSON.parse(result.text);
    expect(parsed.meta.commits).toBe(10);
    expect(parsed.sections).toHaveLength(2);

    // Can be piped to jq or used by other tools
    expect(typeof result.text).toBe('string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('handles empty markdown input', () => {
    const plainResult = formatOutput('', 'plain');
    expect(plainResult.text).toBe('');

    const slackResult = formatOutput('', 'slack');
    expect(slackResult.text).toBe('');
  });

  it('handles markdown with only whitespace', () => {
    const result = formatOutput('   \n\n   ', 'plain');
    expect(result.text).toBe('');
  });

  it('handles markdown with emoji', () => {
    const md = '## 🚀 Shipped\n\n- ✅ Feature complete';
    const plain = formatOutput(md, 'plain');
    expect(plain.text).toContain('🚀 Shipped:');
    expect(plain.text).toContain('✅ Feature complete');

    const slack = formatOutput(md, 'slack');
    expect(slack.text).toContain('🚀 Shipped');
  });

  it('handles deeply nested markdown', () => {
    const md = '# Level 1\n## Level 2\n### Level 3\n#### Level 4';
    const plain = formatOutput(md, 'plain');
    expect(plain.text).not.toContain('#');
  });

  it('handles multiline code blocks in plain format', () => {
    const md = '## Code Changes\n\n```js\nfunction hello() {\n  return "world";\n}\n```';
    const result = formatOutput(md, 'plain');
    expect(result.text).toContain('function hello()');
    expect(result.text).not.toContain('```');
  });

  it('Slack format does not corrupt inline code inside sentences', () => {
    const md = 'Refactored the `UserService` class to use `async/await` pattern';
    const result = formatOutput(md, 'slack');
    expect(result.text).toContain('`UserService`');
    expect(result.text).toContain('`async/await`');
  });
});
