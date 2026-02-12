import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { ConfigManager } from '../core/config.js';
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
    const configManager = new ConfigManager();
    const userConfig = configManager.get();

    // Check if in git repo
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      console.log(UI.info('Run this command inside a git repository'));
      process.exit(1);
    }

    // Check if Copilot CLI is installed
    if (!(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      console.log(UI.info('Install: https://github.com/github/copilot-cli'));
      process.exit(1);
    }

    const load = spinner('Analyzing your work...').start();

    try {
      // Get current user email
      let userEmail = userConfig.user.email;
      if (!userEmail) {
        try {
          const user = await configManager.autoDetectUser();
          userEmail = user.email;
          load.text = `Detected user: ${user.name} <${user.email}>`;
        } catch {
          load.stop();
          console.log(UI.error('Could not detect git user'));
          console.log(UI.info('Run: git config --global user.email "your@email.com"'));
          console.log(UI.info('Or configure: devdaily config set user.email "your@email.com"'));
          process.exit(1);
        }
      }

      // Get commits filtered by current user
      const days = parseInt(options.days, 10);
      const since = getDaysAgo(days);
      const commits = await git.getCommits({
        since,
        author: userEmail,
      });

      if (commits.length === 0) {
        load.stop();
        console.log(UI.warning(`No commits found for ${userEmail} in the last ${days} day(s)`));
        console.log(UI.info(`Try: devdaily standup --days=${days + 1}`));
        process.exit(0);
      }

      // Get file changes for better context
      load.text = 'Analyzing file changes...';
      const allFiles: string[] = [];
      for (const commit of commits.slice(0, 10)) {
        // Limit to first 10 commits for performance
        try {
          const files = await git.getChangedFilesForCommit(commit.hash);
          allFiles.push(...files);
        } catch {
          // Ignore errors for individual commits
        }
      }
      const uniqueFiles = [...new Set(allFiles)];

      load.text = 'Generating standup notes with Copilot CLI...';

      // Generate standup using Copilot with file context
      const commitMessages = commits.map((c) => c.message);
      const standup = await copilot.summarizeCommits(commitMessages, uniqueFiles);

      load.stop();

      // Format output with date/time and user info
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: userConfig.timezone,
      });
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userConfig.timezone,
      });

      const title = `Standup - ${dateStr} ${timeStr}`;
      
      // Show commit messages for verification
      const commitList = commits.map((c, i) => `  ${i + 1}. ${c.message}`).join('\n');
      const footer = `\n${UI.divider()}\n${UI.dim(`User: ${userEmail}`)}\n${UI.dim(`${commits.length} commits analyzed:`)}\n${UI.dim(commitList)}`;
      
      const content = `${standup}${footer}`;

      console.log(UI.box(content, title));

      // Copy only the standup text to clipboard (not the box)
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
