import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { UI } from '../utils/ui.js';
import { spinner, copyToClipboard, getDaysAgo } from '../utils/helpers.js';

export const standupCommand = new Command('standup')
  .description('Generate standup notes from your recent commits')
  .option('-d, --days <number>', 'Number of days to look back', '1')
  .option('-f, --format <type>', 'Output format (markdown|slack|plain)', 'markdown')
  .option('--no-copy', 'Do not copy to clipboard')
  .action(async (options) => {
    const git = new GitAnalyzer();
    const copilot = new CopilotClient();

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

    const load = spinner('Analyzing your work...').start();

    try {
      // Get user info
      const user = await git.getCurrentUser();
      
      // Get commits
      const days = parseInt(options.days, 10);
      const since = getDaysAgo(days);
      const commits = await git.getCommits({
        since,
        author: user.email,
      });

      if (commits.length === 0) {
        load.stop();
        console.log(UI.warning(`No commits found in the last ${days} day(s)`));
        console.log(UI.info(`Try: devdaily standup --days=${days + 1}`));
        process.exit(0);
      }

      load.text = 'Generating standup notes with Copilot CLI...';

      // Generate standup using Copilot
      const commitMessages = commits.map((c) => c.message);
      const standup = await copilot.summarizeCommits(commitMessages);

      load.stop();

      // Format output
      const title = days === 1 ? 'Your Standup' : `Your Work (Last ${days} Days)`;
      const content = `${standup}\n\n${UI.divider()}\n${UI.dim(`${commits.length} commits analyzed`)}`;
      
      console.log(UI.box(content, title));

      // Copy to clipboard
      if (options.copy) {
        await copyToClipboard(standup);
      }
    } catch (error) {
      load.stop();
      console.log(UI.error('Failed to generate standup'));
      console.log(UI.dim((error as Error).message));
      process.exit(1);
    }
  });
