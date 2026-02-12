import { Command } from 'commander';
import inquirer from 'inquirer';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import {
  getProjectManagementClient,
  extractTicketIds,
  extractTicketFromBranch,
  type Ticket,
} from '../core/project-management.js';
import { loadPRTemplate, fillTemplate, type PRTemplate } from '../core/pr-template.js';
import {
  getRepoMetadata,
  getRepoInfo,
  createPR,
  getPRPreviewUrl,
  type GitHubLabel,
  type GitHubUser,
} from '../core/github-repo.js';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { copyToClipboard } from '../utils/helpers.js';
import { generatePRTitle, categorizePRType } from '../utils/commitlint.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

/**
 * Render a PR preview in the terminal
 */
function renderPRPreview(
  title: string,
  body: string,
  metadata: {
    branch: string;
    base: string;
    labels?: string[];
    assignees?: string[];
    reviewers?: string[];
    isDraft?: boolean;
  }
): void {
  console.log('');

  // Header
  console.log(
    colors.muted('┌─────────────────────────────────────────────────────────────────────┐')
  );
  console.log(
    colors.muted('│') + ' ' + colors.bold('PR Preview') + ' '.repeat(58) + colors.muted('│')
  );
  console.log(
    colors.muted('├─────────────────────────────────────────────────────────────────────┤')
  );

  // Title
  console.log(colors.muted('│'));
  console.log(colors.muted('│  ') + colors.accent('⬤') + ' ' + colors.bold(title));
  console.log(colors.muted('│'));

  // Branch info
  console.log(
    colors.muted('│  ') +
      colors.primary(metadata.branch) +
      colors.muted(' → ') +
      colors.accent(metadata.base)
  );

  // Metadata badges
  if (metadata.isDraft) {
    console.log(colors.muted('│  ') + colors.warning('◉ Draft'));
  }

  if (metadata.labels && metadata.labels.length > 0) {
    console.log(
      colors.muted('│  ') + '🏷️  ' + metadata.labels.map((l) => colors.accent(l)).join(' ')
    );
  }

  if (metadata.assignees && metadata.assignees.length > 0) {
    console.log(colors.muted('│  ') + '👤 Assignees: ' + metadata.assignees.join(', '));
  }

  if (metadata.reviewers && metadata.reviewers.length > 0) {
    console.log(colors.muted('│  ') + '👁️  Reviewers: ' + metadata.reviewers.join(', '));
  }

  console.log(colors.muted('│'));
  console.log(
    colors.muted('├─────────────────────────────────────────────────────────────────────┤')
  );

  // Body preview
  const lines = body.split('\n').slice(0, 25); // First 25 lines
  for (const line of lines) {
    // Render markdown-like formatting
    if (line.startsWith('## ')) {
      console.log(colors.muted('│  ') + colors.bold(colors.primary(line.replace('## ', '▸ '))));
    } else if (line.startsWith('- [ ]')) {
      console.log(colors.muted('│  ') + '  ☐ ' + line.replace('- [ ] ', ''));
    } else if (line.startsWith('- [x]')) {
      console.log(
        colors.muted('│  ') + '  ' + colors.success('☑') + ' ' + line.replace('- [x] ', '')
      );
    } else if (line.startsWith('- ')) {
      console.log(colors.muted('│  ') + '  • ' + line.replace('- ', ''));
    } else if (line.match(/^\d+\./)) {
      console.log(colors.muted('│  ') + '  ' + line);
    } else {
      console.log(colors.muted('│  ') + line);
    }
  }

  if (body.split('\n').length > 25) {
    console.log(
      colors.muted('│  ') + colors.muted(`... ${body.split('\n').length - 25} more lines`)
    );
  }

  console.log(colors.muted('│'));
  console.log(
    colors.muted('└─────────────────────────────────────────────────────────────────────┘')
  );
  console.log('');
}

/**
 * Interactive label selection
 */
async function selectLabels(availableLabels: GitHubLabel[]): Promise<string[]> {
  if (availableLabels.length === 0) {
    return [];
  }

  const { selectedLabels } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedLabels',
      message: 'Select labels:',
      choices: availableLabels.map((label) => ({
        name: `${label.name}${label.description ? ` - ${colors.muted(label.description)}` : ''}`,
        value: label.name,
      })),
      pageSize: 10,
    },
  ]);

  return selectedLabels;
}

/**
 * Interactive reviewer/assignee selection
 */
async function selectUsers(
  availableUsers: GitHubUser[],
  type: 'reviewers' | 'assignees'
): Promise<string[]> {
  if (availableUsers.length === 0) {
    return [];
  }

  const { selectedUsers } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedUsers',
      message: `Select ${type}:`,
      choices: availableUsers.map((user) => ({
        name: `@${user.login}${user.name ? ` (${user.name})` : ''}`,
        value: user.login,
      })),
      pageSize: 10,
    },
  ]);

  return selectedUsers;
}

export const prCommand = new Command('pr')
  .description('Generate PR description from current branch')
  .option('-b, --base <branch>', 'Base branch to compare against', 'main')
  .option('-c, --create', 'Create PR on GitHub')
  .option('-d, --draft', 'Create as draft PR')
  .option('-p, --preview', 'Show preview before creating')
  .option('-t, --ticket <id>', 'Include specific ticket/issue for context')
  .option('--no-tickets', 'Skip fetching ticket/issue context')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--no-template', 'Ignore PR template, use default format')
  .option('-i, --interactive', 'Interactive mode for labels, reviewers, assignees')
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
      console.log(UI.info('Install with: brew install copilot-cli'));
      process.exit(1);
    }

    const base = options.base || config.pr.defaultBase;
    const spinner = UI.spinner('Analyzing branch...');
    spinner.start();

    try {
      // Get repo root
      const repoRoot = await git.getRepoRoot();

      // Get current branch
      const currentBranch = await git.getCurrentBranch();

      if (currentBranch === base) {
        spinner.stop();
        console.log('');
        console.log(UI.error(`Cannot create PR from ${base} branch`));
        console.log(UI.info('Switch to a feature branch first'));
        process.exit(1);
      }

      // Get commits on this branch
      const commits = await git.getCommits();

      if (commits.length === 0) {
        spinner.stop();
        console.log('');
        console.log(UI.warning('No commits on this branch'));
        process.exit(0);
      }

      // Get changed files
      const files = await git.getChangedFiles(base);

      // Extract ticket IDs from various sources
      const commitMessages = commits.map((c) => c.message);
      const ticketIds = new Set<string>();

      // From user-provided ticket
      if (options.ticket) {
        ticketIds.add(options.ticket);
      }

      // From branch name
      const branchTicket = extractTicketFromBranch(currentBranch);
      if (branchTicket) {
        ticketIds.add(branchTicket);
      }

      // From commit messages
      const commitTickets = extractTicketIds(commitMessages.join(' '));
      commitTickets.forEach((id) => ticketIds.add(id));

      // Fetch ticket details
      let tickets: Ticket[] = [];
      if (options.tickets !== false && ticketIds.size > 0) {
        spinner.text = `Fetching ${config.projectManagement.tool} ticket context...`;
        if (await pmClient.isConfigured()) {
          tickets = await pmClient.getTickets(Array.from(ticketIds));
        }
      }

      // Check for PR template
      spinner.text = 'Looking for PR template...';
      let template: PRTemplate | null = null;
      let usingTemplate = false;

      if (options.template !== false) {
        template = await loadPRTemplate(repoRoot);
        if (template) {
          usingTemplate = true;
          spinner.text = `Found template: ${template.path}`;
        }
      }

      // Generate PR content
      spinner.text = 'Generating PR description with Copilot CLI...';

      let prTitle: string;
      let prBody: string;
      let prType: string;

      if (usingTemplate && template) {
        // Generate structured content for template
        const content = await copilot.generatePRContent({
          branch: currentBranch,
          commits: commitMessages,
          files,
          issues: Array.from(ticketIds),
          ticketDetails: tickets,
          templateSections: template.sections.map((s) => s.name),
        });

        prTitle = content.title;
        prType = content.type;

        // Build ticket links
        const ticketLinks = tickets.map((t) => ({ id: t.id, url: t.url }));

        // Fill the template
        prBody = fillTemplate(template, {
          title: content.title,
          description: content.description,
          type: content.type,
          impact: content.impact,
          testing: content.testing,
          ticketIds: Array.from(ticketIds),
          ticketLinks,
          breakingChanges: content.breakingChanges,
          additionalInfo: content.additionalInfo,
        });
      } else {
        // Use default format
        prTitle = generatePRTitle(commitMessages);
        prType = categorizePRType(commitMessages);
        prBody = await copilot.generatePRDescription({
          branch: currentBranch,
          commits: commitMessages,
          files,
          issues: Array.from(ticketIds),
          ticketDetails: tickets,
        });
      }

      spinner.stop();

      // Fetch repo metadata for interactive mode
      let repoMeta: Awaited<ReturnType<typeof getRepoMetadata>> = null;
      let selectedLabels: string[] = [];
      let selectedReviewers: string[] = [];
      let selectedAssignees: string[] = [];

      if (options.interactive) {
        const metaSpinner = UI.spinner('Fetching repository metadata...');
        metaSpinner.start();
        repoMeta = await getRepoMetadata();
        metaSpinner.stop();
      }

      // Show template info
      console.log('');
      if (usingTemplate && template) {
        console.log(UI.info(`Using PR template: ${colors.accent(template.path)}`));
      } else {
        console.log(UI.info('Using default PR format (no template found)'));
      }

      // Interactive selection
      if (options.interactive && repoMeta) {
        console.log('');
        console.log(UI.section('Configure PR', '⚙️'));
        console.log('');

        // Select labels
        if (repoMeta.labels.length > 0) {
          selectedLabels = await selectLabels(repoMeta.labels);
        }

        // Select reviewers
        if (repoMeta.collaborators.length > 0) {
          selectedReviewers = await selectUsers(repoMeta.collaborators, 'reviewers');
        }

        // Select assignees
        if (repoMeta.collaborators.length > 0) {
          selectedAssignees = await selectUsers(repoMeta.collaborators, 'assignees');
        }
      }

      // Show preview
      const isDraft = options.draft;

      if (options.preview || options.interactive) {
        renderPRPreview(prTitle, prBody, {
          branch: currentBranch,
          base,
          labels: selectedLabels,
          assignees: selectedAssignees,
          reviewers: selectedReviewers,
          isDraft,
        });
      } else {
        // Simple display
        console.log('');
        console.log(
          UI.box(`${colors.bold(prTitle)}\n\n${prBody}`, `${ASCII.icons.pr} PR: ${currentBranch}`)
        );
      }

      // Stats
      if (config.output.showStats) {
        const statItems: { label: string; value: string | number }[] = [
          { label: 'commits', value: commits.length },
          { label: 'files changed', value: files.length },
          { label: 'type', value: prType },
        ];
        if (tickets.length > 0) {
          statItems.push({ label: 'tickets linked', value: tickets.length });
        }
        if (usingTemplate) {
          statItems.push({ label: 'template', value: '✓' });
        }
        console.log(UI.stats(statItems));
      }
      console.log('');

      // Action menu
      const choices = [
        { name: `${ASCII.status.bullet} Copy to clipboard`, value: 'copy' },
        { name: `${ASCII.status.arrowRight} Create PR on GitHub`, value: 'create' },
        { name: `${ASCII.status.bullet} Create draft PR`, value: 'draft' },
      ];

      // Add preview in browser option
      const repoInfo = await getRepoInfo();
      if (repoInfo) {
        choices.push({
          name: `${ASCII.status.bullet} Preview in browser`,
          value: 'browser',
        });
      }

      if (!options.interactive && repoMeta === null) {
        choices.push({
          name: `${ASCII.status.bullet} Configure labels & reviewers`,
          value: 'configure',
        });
      }

      choices.push(
        // @ts-expect-error - inquirer separator type
        new inquirer.Separator(),
        { name: `${ASCII.status.cross} Exit`, value: 'exit' }
      );

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: colors.primary('What would you like to do?'),
          choices,
        },
      ]);

      if (action === 'copy') {
        await copyToClipboard(`${prTitle}\n\n${prBody}`);
        console.log(UI.success('Copied to clipboard!'));
      } else if (action === 'browser' && repoInfo) {
        const previewUrl = getPRPreviewUrl(repoInfo.owner, repoInfo.name, base, currentBranch);
        const { execa } = await import('execa');
        await execa('open', [previewUrl]);
        console.log(UI.success('Opened in browser!'));
      } else if (action === 'configure') {
        // Fetch metadata and let user configure
        const metaSpinner = UI.spinner('Fetching repository metadata...');
        metaSpinner.start();
        repoMeta = await getRepoMetadata();
        metaSpinner.stop();

        if (repoMeta) {
          console.log('');
          if (repoMeta.labels.length > 0) {
            selectedLabels = await selectLabels(repoMeta.labels);
          }
          if (repoMeta.collaborators.length > 0) {
            selectedReviewers = await selectUsers(repoMeta.collaborators, 'reviewers');
          }
          if (repoMeta.collaborators.length > 0) {
            selectedAssignees = await selectUsers(repoMeta.collaborators, 'assignees');
          }

          // Show updated preview
          renderPRPreview(prTitle, prBody, {
            branch: currentBranch,
            base,
            labels: selectedLabels,
            assignees: selectedAssignees,
            reviewers: selectedReviewers,
            isDraft,
          });

          // Ask to create
          const { confirmCreate } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmCreate',
              message: 'Create this PR?',
              default: true,
            },
          ]);

          if (confirmCreate) {
            await doCreatePR(
              prTitle,
              prBody,
              base,
              selectedLabels,
              selectedAssignees,
              selectedReviewers,
              false
            );
          }
        }
      } else if (action === 'create' || action === 'draft') {
        const createDraft = action === 'draft' || options.draft;
        await doCreatePR(
          prTitle,
          prBody,
          base,
          selectedLabels,
          selectedAssignees,
          selectedReviewers,
          createDraft
        );
      }
    } catch (error) {
      spinner.stop();
      console.log('');
      console.log(UI.error('Failed to generate PR description'));
      console.log(colors.muted((error as Error).message));
      process.exit(1);
    }
  });

/**
 * Create the PR on GitHub
 */
async function doCreatePR(
  title: string,
  body: string,
  base: string,
  labels: string[],
  assignees: string[],
  reviewers: string[],
  isDraft: boolean
): Promise<void> {
  const createSpinner = UI.spinner(`Creating ${isDraft ? 'draft ' : ''}PR...`);
  createSpinner.start();

  try {
    const result = await createPR({
      title,
      body,
      base,
      draft: isDraft,
      labels: labels.length > 0 ? labels : undefined,
      assignees: assignees.length > 0 ? assignees : undefined,
      reviewers: reviewers.length > 0 ? reviewers : undefined,
    });

    createSpinner.stop();
    console.log('');
    console.log(UI.success('PR created successfully'));
    console.log(colors.accent(result.url));
  } catch (error) {
    createSpinner.stop();
    console.log('');
    console.log(UI.error('Failed to create PR'));
    console.log(colors.muted((error as Error).message));
  }
}
