import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { UI } from '../utils/ui.js';
import { spinner, copyToClipboard, getWeekStart, getWeekEnd, formatDateRange } from '../utils/helpers.js';

export const weekCommand = new Command('week')
  .description('Generate weekly work summary')
  .option('-l, --last', 'Last week instead of current week')
  .option('--no-copy', 'Do not copy to clipboard')
  .action(async (options) => {
    const git = new GitAnalyzer();
    const copilot = new CopilotClient();

    // Check if in git repo
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      process.exit(1);
    }

    // Check if Copilot CLI is installed
    if (!(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      process.exit(1);
    }

    const load = spinner('Analyzing your week...').start();

    try {
      const weeksAgo = options.last ? 1 : 0;
      const start = getWeekStart(weeksAgo);
      const end = getWeekEnd(weeksAgo);

      // Get user info
      const user = await git.getCurrentUser();
      
      // Get commits
      const commits = await git.getCommits({
        since: start,
        until: end,
        author: user.email,
      });

      if (commits.length === 0) {
        load.stop();
        console.log(UI.warning('No commits found this week'));
        process.exit(0);
      }

      // Get stats
      const stats = await git.getDiffStats();

      load.text = 'Generating summary with Copilot CLI...';

      // Generate summary
      const commitMessages = commits.map((c) => c.message);
      const summary = await copilot.generateWeeklySummary({
        commits: commitMessages,
        stats: {
          commits: commits.length,
          linesAdded: stats.insertions,
          linesRemoved: stats.deletions,
        },
      });

      load.stop();

      // Display
      const title = `Week in Review (${formatDateRange(start, end)})`;
      const content = `${summary}\n\n${UI.divider()}\n${UI.dim(`${commits.length} commits • ${stats.insertions}+ ${stats.deletions}- lines`)}`;
      
      console.log(UI.box(content, title));

      // Copy to clipboard
      if (options.copy) {
        await copyToClipboard(summary);
      }
    } catch (error) {
      load.stop();
      console.log(UI.error('Failed to generate weekly summary'));
      console.log(UI.dim((error as Error).message));
      process.exit(1);
    }
  });
