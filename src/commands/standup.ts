import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { ContextAnalyzer } from '../core/context-analyzer.js';
import {
  getProjectManagementClient,
  extractTicketIds,
  type Ticket,
} from '../core/project-management.js';
import { sendNotification, formatStandupNotification } from '../core/notifications.js';
import UI from '../ui/renderer.js';
import { copyToClipboard, getDaysAgo } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

export const standupCommand = new Command('standup')
  .description('Generate standup notes from your recent commits')
  .option('-d, --days <number>', 'Number of days to look back', '1')
  .option('-f, --format <type>', 'Output format (markdown|slack|plain|json)', 'markdown')
  .option('-a, --author <email>', 'Filter by author email')
  .option('-t, --ticket <id>', 'Include specific ticket/issue for context')
  .option('--no-tickets', 'Skip fetching ticket/issue context')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--send', 'Send to configured notification channels (Slack/Discord)')
  .option('--slack', 'Send to Slack')
  .option('--discord', 'Send to Discord')
  .option('--context', 'Show detailed work context analysis')
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const copilot = new CopilotClient();
    const pmClient = getProjectManagementClient();
    const contextAnalyzer = new ContextAnalyzer(
      undefined,
      config.projectManagement.tool,
      config.projectManagement.ticketPrefix
    );

    // Check if in git repo
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      console.log(UI.info('Run this command inside a git repository'));
      process.exit(1);
    }

    // Check if Copilot CLI is installed
    if (!(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      console.log(UI.info('Install with: gh extension install github/gh-copilot'));
      process.exit(1);
    }

    const spinner = UI.spinner('Analyzing your work...');
    spinner.start();

    try {
      // Get commits
      const days = parseInt(options.days, 10) || config.standup.defaultDays;
      const since = getDaysAgo(days);
      const commits = await git.getCommits({
        since,
        author: options.author,
      });

      if (commits.length === 0) {
        spinner.stop();
        console.log('');
        console.log(UI.warning(`No commits found in the last ${days} day(s)`));
        console.log(UI.info(`Try: devdaily standup --days=${days + 1}`));
        process.exit(0);
      }

      // Get enhanced work context
      spinner.text = 'Analyzing work context...';
      const workContext = await contextAnalyzer.getWorkContext({
        since,
        base: config.git.defaultBranch,
      });

      // Show context analysis if requested
      if (options.context) {
        spinner.stop();
        console.log('');
        console.log(UI.section('Work Context Analysis'));
        console.log('');
        console.log(`  ${colors.accent('Branch:')} ${workContext.branch}`);

        if (workContext.tickets.length > 0) {
          const ticketStr = workContext.tickets.map((t) => `${t.id} (${t.type})`).join(', ');
          console.log(`  ${colors.accent('Tickets:')} ${ticketStr}`);
        }

        if (workContext.categories.length > 0) {
          console.log(`  ${colors.accent('Work Categories:')}`);
          for (const cat of workContext.categories.slice(0, 4)) {
            const bar =
              '█'.repeat(Math.round(cat.percentage / 5)) +
              '░'.repeat(20 - Math.round(cat.percentage / 5));
            console.log(`    ${cat.name.padEnd(12)} ${bar} ${cat.percentage}%`);
          }
        }

        console.log(
          `  ${colors.accent('Time Span:')} ${workContext.timeRange.durationHours} hours`
        );
        console.log(`  ${colors.accent('Files Changed:')} ${workContext.filesChanged.length}`);
        console.log('');
        spinner.start();
      }

      // Extract ticket IDs from commits and fetch context
      const commitMessages = commits.map((c) => c.message);
      let tickets: Ticket[] = [];

      if (options.tickets !== false) {
        spinner.text = `Fetching ${config.projectManagement.tool} ticket context...`;

        // Collect ticket IDs from various sources
        const ticketIds = new Set<string>();

        // From user-provided ticket
        if (options.ticket) {
          ticketIds.add(options.ticket);
        }

        // From commit messages
        const commitTickets = extractTicketIds(commitMessages.join(' '));
        commitTickets.forEach((id) => ticketIds.add(id));

        // Fetch ticket details
        if (ticketIds.size > 0 && (await pmClient.isConfigured())) {
          const fetchedTickets = await pmClient.getTickets(Array.from(ticketIds));
          tickets = fetchedTickets;
        }
      }

      spinner.text = 'Generating standup notes with Copilot CLI...';

      // Generate standup using Copilot with ticket context and work context
      const standup = await copilot.summarizeCommits(commitMessages, tickets, workContext);

      spinner.stop();

      // Format output
      const title = days === 1 ? 'Your Standup' : `Your Work (Last ${days} Days)`;

      console.log('');
      console.log(UI.box(standup, title));

      // Stats
      if (config.output.showStats) {
        const statItems: { label: string; value: string | number }[] = [
          { label: 'commits analyzed', value: commits.length },
          { label: 'days', value: days },
        ];
        if (tickets.length > 0) {
          statItems.push({ label: 'tickets linked', value: tickets.length });
        }
        if (workContext.categories.length > 0) {
          statItems.push({ label: 'primary area', value: workContext.summary.primaryCategory });
        }
        console.log(UI.stats(statItems));
      }
      console.log('');

      // Copy to clipboard
      if (options.copy && config.output.copyToClipboard !== false) {
        await copyToClipboard(standup);
        console.log(UI.success('Copied to clipboard'));
      }

      // Send to notifications
      if (options.send || options.slack || options.discord) {
        const ticketLinks = tickets.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
        }));

        const notification = formatStandupNotification(standup, ticketLinks);

        const sendToSlack = options.slack || options.send;
        const sendToDiscord = options.discord || options.send;

        const results = await sendNotification(notification, {
          slack: sendToSlack,
          discord: sendToDiscord,
        });

        if (results.slack) {
          console.log(UI.success('Sent to Slack'));
        }
        if (results.discord) {
          console.log(UI.success('Sent to Discord'));
        }
        if (results.slack === false || results.discord === false) {
          console.log(
            UI.warning('Some notifications failed to send. Check your webhook configuration.')
          );
        }
      }
    } catch (error) {
      spinner.stop();
      console.log('');
      console.log(UI.error('Failed to generate standup'));
      console.log(colors.muted((error as Error).message));
      process.exit(1);
    }
  });
