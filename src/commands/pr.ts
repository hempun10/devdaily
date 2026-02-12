import { Command } from 'commander';
import inquirer from 'inquirer';
import { execa } from 'execa';
import open from 'open';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { UI } from '../utils/ui.js';
import { spinner, copyToClipboard } from '../utils/helpers.js';
import { extractIssueNumbers, generatePRTitle, categorizePRType } from '../utils/commitlint.js';

export const prCommand = new Command('pr')
  .description('Generate PR description from current branch')
  .option('-b, --base <branch>', 'Base branch to compare against (auto-detects if not provided)')
  .option('-c, --create', 'Create PR on GitHub')
  .option('-d, --draft', 'Create as draft PR')
  .option('-e, --edit', 'Edit description before creating')
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
      console.log(UI.info('Install: https://github.com/github/copilot-cli'));
      process.exit(1);
    }

    const load = spinner('Analyzing branch...').start();

    try {
      // Get current branch
      const currentBranch = await git.getCurrentBranch();
      
      // Auto-detect base branch if not provided
      const baseBranch = options.base || (await git.getDefaultBranch());

      if (currentBranch === baseBranch) {
        load.stop();
        console.log(UI.error(`Cannot create PR from ${baseBranch} branch`));
        console.log(UI.info('Switch to a feature branch first'));
        process.exit(1);
      }

      // Get commits on this branch
      const commits = await git.getCommits();

      if (commits.length === 0) {
        load.stop();
        console.log(UI.warning('No commits on this branch'));
        process.exit(0);
      }

      // Get changed files
      const files = await git.getChangedFiles(baseBranch);

      // Extract issue numbers
      const commitMessages = commits.map((c) => c.message);
      const allText = commitMessages.join(' ');
      const issues = extractIssueNumbers(allText);

      // Generate PR title from commits
      const suggestedTitle = generatePRTitle(commitMessages);
      const prType = categorizePRType(commitMessages);

      load.text = 'Generating PR description with Copilot CLI...';

      // Generate description
      const description = await copilot.generatePRDescription({
        branch: currentBranch,
        commits: commitMessages,
        files,
        issues,
      });

      load.stop();

      // Display
      console.log(
        UI.box(
          `${UI.colors.bold(suggestedTitle)}\n\n${description}\n\n${UI.divider()}\n${UI.dim(`${commits.length} commits • ${files.length} files changed • ${prType}`)}`,
          `PR Description for ${currentBranch}`
        )
      );

      // Interactive options
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Preview in browser (render markdown)', value: 'preview' },
            { name: 'Copy to clipboard', value: 'copy' },
            { name: 'Create PR on GitHub', value: 'create' },
            { name: 'Create draft PR', value: 'draft' },
            { name: 'Exit', value: 'exit' },
          ],
        },
      ]);

      if (action === 'copy') {
        await copyToClipboard(description);
      } else if (action === 'preview') {
        // Create temporary markdown file and open in browser
        console.log(UI.info('Opening preview in browser...'));
        // TODO: Implement preview (save to temp file, open with `open` package)
        await open(`https://github.com`);
      } else if (action === 'create' || action === 'draft') {
        const isDraft = action === 'draft' || options.draft;

        const createSpinner = spinner(`Creating ${isDraft ? 'draft ' : ''}PR...`).start();

        try {
          const args = [
            'pr',
            'create',
            '--title',
            suggestedTitle,
            '--body',
            description,
            '--base',
            baseBranch,
          ];

          if (isDraft) {
            args.push('--draft');
          }

          const { stdout } = await execa('gh', args);

          createSpinner.stop();
          console.log(UI.success('PR created successfully'));
          console.log(UI.dim(stdout));
        } catch (error) {
          createSpinner.stop();
          console.log(UI.error('Failed to create PR'));
          console.log(UI.dim((error as Error).message));
        }
      }
    } catch (error) {
      load.stop();
      console.log(UI.error('Failed to generate PR description'));
      console.log(UI.dim((error as Error).message));
      process.exit(1);
    }
  });
