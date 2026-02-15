/**
 * Notification integrations for Slack and Discord
 * Sends standup updates, PR notifications, etc. via webhooks
 */

import { getConfig, getSecrets } from '../config/index.js';
import { formatOutput } from '../utils/formatter.js';

export interface NotificationMessage {
  title?: string;
  text: string;
  type?: 'standup' | 'pr' | 'weekly' | 'info';
  ticketLinks?: { id: string; url: string; title?: string }[];
  footer?: string;
}

/**
 * Slack webhook message format
 */
interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string;
    url?: string;
    style?: string;
  }>;
}

interface SlackAttachment {
  color?: string;
  blocks?: SlackBlock[];
}

/**
 * Discord webhook message format
 */
interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

/**
 * Get notification emoji based on type
 */
function getTypeEmoji(type?: string): string {
  switch (type) {
    case 'standup':
      return '☀️';
    case 'pr':
      return '🔀';
    case 'weekly':
      return '📊';
    default:
      return '📝';
  }
}

/**
 * Get notification color based on type (for Discord embed)
 */
function getTypeColor(type?: string): number {
  switch (type) {
    case 'standup':
      return 0x4ade80; // Green
    case 'pr':
      return 0x60a5fa; // Blue
    case 'weekly':
      return 0xa78bfa; // Purple
    default:
      return 0x94a3b8; // Gray
  }
}

/**
 * Format a message for Slack
 */
function formatSlackMessage(message: NotificationMessage): SlackMessage {
  const emoji = getTypeEmoji(message.type);
  const blocks: SlackBlock[] = [];

  // Header
  if (message.title) {
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${message.title}`,
        emoji: true,
      },
    });
  }

  // Main content — convert markdown to Slack mrkdwn format
  const slackText = formatOutput(message.text, 'slack').text;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: slackText,
    },
  });

  // Ticket links
  if (message.ticketLinks && message.ticketLinks.length > 0) {
    const ticketText = message.ticketLinks
      .map((t) => `• <${t.url}|${t.id}>${t.title ? `: ${t.title}` : ''}`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Related Tickets:*\n${ticketText}`,
      },
    });
  }

  // Divider
  blocks.push({ type: 'divider' });

  // Footer
  if (message.footer) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: message.footer,
        },
      ],
    });
  } else {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Sent via DevDaily · ${new Date().toLocaleString()}`,
        },
      ],
    });
  }

  return { blocks };
}

/**
 * Format a message for Discord
 */
function formatDiscordMessage(message: NotificationMessage): DiscordMessage {
  const emoji = getTypeEmoji(message.type);
  const color = getTypeColor(message.type);

  const embed: DiscordEmbed = {
    title: message.title ? `${emoji} ${message.title}` : undefined,
    description: message.text,
    color,
    timestamp: new Date().toISOString(),
    footer: {
      text: message.footer || 'Sent via DevDaily',
    },
  };

  // Add ticket links as fields
  if (message.ticketLinks && message.ticketLinks.length > 0) {
    embed.fields = message.ticketLinks.map((t) => ({
      name: t.id,
      value: t.title ? `[${t.title}](${t.url})` : `[View Ticket](${t.url})`,
      inline: true,
    }));
  }

  return {
    embeds: [embed],
    username: 'DevDaily',
  };
}

/**
 * Send a notification to Slack
 */
export async function sendToSlack(
  message: NotificationMessage,
  webhookUrl?: string
): Promise<boolean> {
  const config = getConfig();
  const secrets = getSecrets();

  const url = webhookUrl || secrets.slack?.webhookUrl || config.notifications?.slack?.webhookUrl;

  if (!url) {
    throw new Error('Slack webhook URL not configured. Run: devdaily init --notifications');
  }

  const payload = formatSlackMessage(message);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }

    return true;
  } catch (error) {
    throw new Error(`Failed to send Slack message: ${(error as Error).message}`);
  }
}

/**
 * Send a notification to Discord
 */
export async function sendToDiscord(
  message: NotificationMessage,
  webhookUrl?: string
): Promise<boolean> {
  const config = getConfig();
  const secrets = getSecrets();

  const url =
    webhookUrl || secrets.discord?.webhookUrl || config.notifications?.discord?.webhookUrl;

  if (!url) {
    throw new Error('Discord webhook URL not configured. Run: devdaily init --notifications');
  }

  const payload = formatDiscordMessage(message);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
    }

    return true;
  } catch (error) {
    throw new Error(`Failed to send Discord message: ${(error as Error).message}`);
  }
}

/**
 * Send notification to configured channels
 */
export async function sendNotification(
  message: NotificationMessage,
  options?: {
    slack?: boolean;
    discord?: boolean;
  }
): Promise<{ slack?: boolean; discord?: boolean }> {
  const config = getConfig();
  const results: { slack?: boolean; discord?: boolean } = {};

  const sendSlack = options?.slack ?? config.notifications?.slack?.enabled;
  const sendDiscord = options?.discord ?? config.notifications?.discord?.enabled;

  if (sendSlack) {
    try {
      results.slack = await sendToSlack(message);
    } catch {
      results.slack = false;
    }
  }

  if (sendDiscord) {
    try {
      results.discord = await sendToDiscord(message);
    } catch {
      results.discord = false;
    }
  }

  return results;
}

/**
 * Format standup for notification
 */
export function formatStandupNotification(
  standupText: string,
  tickets?: { id: string; url: string; title?: string }[]
): NotificationMessage {
  return {
    title: 'Daily Standup',
    text: standupText,
    type: 'standup',
    ticketLinks: tickets,
  };
}

/**
 * Format PR notification
 */
export function formatPRNotification(
  title: string,
  url: string,
  description: string
): NotificationMessage {
  return {
    title: `New PR: ${title}`,
    text: `${description}\n\n🔗 <${url}|View Pull Request>`,
    type: 'pr',
  };
}

/**
 * Format weekly summary notification
 */
export function formatWeeklyNotification(
  summaryText: string,
  stats?: { commits: number; prs?: number }
): NotificationMessage {
  const footer = stats
    ? `📊 ${stats.commits} commits${stats.prs ? ` · ${stats.prs} PRs` : ''} this week`
    : undefined;

  return {
    title: 'Weekly Summary',
    text: summaryText,
    type: 'weekly',
    footer,
  };
}
