import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import {
  getProjectManagementClient,
  extractTicketIds,
  type Ticket,
} from '../core/project-management.js';
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
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const copilot = new CopilotClient();
    const pmClient = getProjectManagementClient();

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

      // Generate standup using Copilot with ticket context
      const standup = await copilot.summarizeCommits(commitMessages, tickets);

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
        console.log(UI.stats(statItems));
      }
      console.log('');

      // Copy to clipboard
      if (options.copy && config.output.copyToClipboard !== false) {
        await copyToClipboard(standup);
        console.log(UI.success('Copied to clipboard'));
      }
    } catch (error) {
      spinner.stop();
      console.log('');
      console.log(UI.error('Failed to generate standup'));
      console.log(colors.muted((error as Error).message));
      process.exit(1);
    }
  });
