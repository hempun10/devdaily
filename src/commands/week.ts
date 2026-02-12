import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { getProjectManagementClient, type Ticket } from '../core/project-management.js';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { copyToClipboard, getWeekStart, getWeekEnd, formatDateRange } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

export const weekCommand = new Command('week')
  .description('Generate weekly work summary')
  .option('-l, --last', 'Last week instead of current week')
  .option('-s, --start <date>', 'Custom start date (YYYY-MM-DD)')
  .option('--no-tickets', 'Skip fetching closed tickets/issues')
  .option('--no-copy', 'Do not copy to clipboard')
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const copilot = new CopilotClient();
    const pmClient = getProjectManagementClient();

    // Check if in git repo
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      process.exit(1);
    }

    // Check if Copilot CLI is installed
    if (!(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      console.log(UI.info('Install with: gh extension install github/gh-copilot'));
      process.exit(1);
    }

    const spinner = UI.spinner('Analyzing your week...');
    spinner.start();

    try {
      let start: Date;
      let end: Date;

      if (options.start) {
        start = new Date(options.start);
        end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        const weeksAgo = options.last ? 1 : 0;
        start = getWeekStart(weeksAgo);
        end = getWeekEnd(weeksAgo);
      }

      // Get commits
      const commits = await git.getCommits({
        since: start,
        until: end,
      });

      if (commits.length === 0) {
        spinner.stop();
        console.log('');
        console.log(UI.warning('No commits found for this week'));
        process.exit(0);
      }

      // Get stats
      const stats = await git.getDiffStats();

      // Fetch closed tickets for this week for better context
      let closedTickets: Ticket[] = [];
      if (options.tickets !== false) {
        spinner.text = `Fetching closed ${config.projectManagement.tool} tickets...`;
        try {
          if (await pmClient.isConfigured()) {
            closedTickets = await pmClient.getRecentlyClosedTickets(7);
          }
        } catch {
          // Silently continue if tool not configured
        }
      }

      spinner.text = 'Generating summary with Copilot CLI...';

      // Generate summary with ticket context
      const commitMessages = commits.map((c) => c.message);
      const summary = await copilot.generateWeeklySummary({
        commits: commitMessages,
        stats: {
          commits: commits.length,
          linesAdded: stats.insertions,
          linesRemoved: stats.deletions,
        },
        closedTickets,
      });

      spinner.stop();

      // Display
      const title = `${ASCII.icons.week} Week in Review (${formatDateRange(start, end)})`;

      console.log('');
      console.log(UI.box(summary, title));

      // Stats
      if (config.output.showStats) {
        const statItems: { label: string; value: string | number; color?: string }[] = [
          { label: 'commits', value: commits.length },
          { label: 'lines added', value: `+${stats.insertions}`, color: 'green' },
          { label: 'lines removed', value: `-${stats.deletions}`, color: 'red' },
        ];
        if (closedTickets.length > 0) {
          statItems.push({ label: 'tickets closed', value: closedTickets.length });
        }
        console.log(UI.stats(statItems));
      }
      console.log('');

      // Copy to clipboard
      if (options.copy && config.output.copyToClipboard !== false) {
        await copyToClipboard(summary);
        console.log(UI.success('Copied to clipboard'));
      }
    } catch (error) {
      spinner.stop();
      console.log('');
      console.log(UI.error('Failed to generate weekly summary'));
      console.log(colors.muted((error as Error).message));
      process.exit(1);
    }
  });
