import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { ConfigManager } from '../core/config.js';
import { UI } from '../utils/ui.js';
import {
  spinner,
  copyToClipboard,
  getWeekStart,
  getWeekEnd,
  formatDateRange,
} from '../utils/helpers.js';

export const weekCommand = new Command('week')
  .description('Generate weekly work summary')
  .option('-l, --last', 'Last week instead of current week')
  .option('--no-copy', 'Do not copy to clipboard')
  .action(async (options) => {
    const git = new GitAnalyzer();
    const copilot = new CopilotClient();
    const configManager = new ConfigManager();
    const config = configManager.get();

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
      // Get current user email
      let userEmail = config.user.email;
      if (!userEmail) {
        try {
          const user = await configManager.autoDetectUser();
          userEmail = user.email;
        } catch {
          load.stop();
          console.log(UI.error('Could not detect git user'));
          console.log(UI.info('Run: git config --global user.email "your@email.com"'));
          process.exit(1);
        }
      }

      const weeksAgo = options.last ? 1 : 0;
      const start = getWeekStart(weeksAgo, config.weekStart);
      const end = getWeekEnd(weeksAgo, config.weekStart);

      // Get commits filtered by current user
      const commits = await git.getCommits({
        since: start,
        until: end,
        author: userEmail,
      });

      if (commits.length === 0) {
        load.stop();
        console.log(UI.warning(`No commits found for ${userEmail} this week`));
        process.exit(0);
      }

      // Get file changes for better context
      load.text = 'Analyzing file changes...';
      const allFiles: string[] = [];
      for (const commit of commits.slice(0, 20)) {
        // Limit to first 20 commits for performance
        try {
          const files = await git.getChangedFilesForCommit(commit.hash);
          allFiles.push(...files);
        } catch {
          // Ignore errors
        }
      }
      const uniqueFiles = [...new Set(allFiles)];

      // Get stats
      const stats = await git.getDiffStats();

      load.text = 'Generating summary with Copilot CLI...';

      // Generate summary with file context
      const commitMessages = commits.map((c) => c.message);
      const summary = await copilot.generateWeeklySummary({
        commits: commitMessages,
        files: uniqueFiles,
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

      // Copy only the summary text to clipboard (not the box)
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
