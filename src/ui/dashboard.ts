import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import UI from './renderer.js';
import { ASCII } from './ascii.js';
import { KeyboardHandler } from './keyboard.js';
import { getConfig } from '../config/index.js';
import { copyToClipboard } from '../utils/helpers.js';
import inquirer from 'inquirer';

const { colors } = UI;

interface DashboardState {
  currentView: 'main' | 'standup' | 'pr' | 'week' | 'settings';
  selectedIndex: number;
  isLoading: boolean;
  lastOutput: string | null;
  commits: Array<{ message: string; date: Date }>;
  branch: string;
  stats: { commits: number; files: number; insertions: number; deletions: number };
}

/**
 * Interactive Dashboard for DevDaily
 */
export class Dashboard {
  private git: GitAnalyzer;
  private copilot: CopilotClient;
  private keyboard: KeyboardHandler;
  private state: DashboardState;
  private isRunning = false;

  constructor() {
    this.git = new GitAnalyzer();
    this.copilot = new CopilotClient();
    this.keyboard = new KeyboardHandler();
    this.state = {
      currentView: 'main',
      selectedIndex: 0,
      isLoading: false,
      lastOutput: null,
      commits: [],
      branch: '',
      stats: { commits: 0, files: 0, insertions: 0, deletions: 0 },
    };
  }

  /**
   * Start the dashboard
   */
  async start(): Promise<void> {
    // Check prerequisites
    if (!(await this.git.isRepository())) {
      console.log(UI.error('Not in a git repository'));
      process.exit(1);
    }

    if (!(await this.copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not installed'));
      console.log(UI.info('Install with: gh extension install github/gh-copilot'));
      process.exit(1);
    }

    this.isRunning = true;

    // Load initial data
    await this.loadData();

    // Render initial view
    this.render();

    // Run main menu loop
    await this.mainMenu();
  }

  /**
   * Load git data
   */
  private async loadData(): Promise<void> {
    try {
      this.state.branch = await this.git.getCurrentBranch();

      const commits = await this.git.getCommits({
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
      this.state.commits = commits;

      const diffStats = await this.git.getDiffStats();
      this.state.stats = {
        commits: commits.length,
        files: diffStats.filesChanged,
        insertions: diffStats.insertions,
        deletions: diffStats.deletions,
      };
    } catch {
      // Expected: may fail if not in a git repo or no commits exist yet.
      // Dashboard will render with default/empty state values.
    }
  }

  /**
   * Render the current view
   */
  private render(): void {
    UI.clear();
    console.log(this.renderMainView());
  }

  /**
   * Render the main dashboard view
   */
  private renderMainView(): string {
    const lines: string[] = [];

    // Header
    lines.push(UI.header('Dashboard'));
    lines.push('');

    // Git status
    lines.push(UI.section('Git Status', ASCII.icons.standup));
    lines.push('');
    lines.push(`  ${colors.accent('Branch:')} ${colors.primary(this.state.branch)}`);
    lines.push(
      `  ${colors.accent('Week:')}   ${UI.stats([
        { label: 'commits', value: this.state.stats.commits },
        { label: 'files changed', value: this.state.stats.files },
        { label: 'insertions', value: `+${this.state.stats.insertions}`, color: 'green' },
        { label: 'deletions', value: `-${this.state.stats.deletions}`, color: 'red' },
      ])}`
    );
    lines.push('');

    // Recent commits
    if (this.state.commits.length > 0) {
      lines.push(colors.bold('  Recent Commits'));
      lines.push('');
      this.state.commits.slice(0, 5).forEach((commit) => {
        const msg =
          commit.message.length > 50 ? commit.message.slice(0, 47) + '...' : commit.message;
        lines.push(`    ${colors.muted(ASCII.status.bullet)} ${msg}`);
      });
      lines.push('');
    }

    // Shortcuts
    lines.push(UI.divider());
    lines.push('');
    lines.push(
      UI.shortcuts([
        { key: 's', action: 'Standup' },
        { key: 'p', action: 'PR Description' },
        { key: 'w', action: 'Week Summary' },
        { key: 'c', action: 'Config' },
        { key: 'q', action: 'Quit' },
      ])
    );
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Main menu loop
   */
  private async mainMenu(): Promise<void> {
    while (this.isRunning) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: colors.primary('What would you like to do?'),
          choices: [
            { name: `${ASCII.icons.standup} Generate Standup Notes`, value: 'standup' },
            { name: `${ASCII.icons.pr} Generate PR Description`, value: 'pr' },
            { name: `${ASCII.icons.week} Generate Weekly Summary`, value: 'week' },
            new inquirer.Separator(),
            { name: `${ASCII.icons.config} Configuration`, value: 'config' },
            { name: `${ASCII.status.info} Refresh Data`, value: 'refresh' },
            new inquirer.Separator(),
            { name: `${ASCII.status.cross} Exit`, value: 'exit' },
          ],
          pageSize: 10,
        },
      ]);

      switch (action) {
        case 'standup':
          await this.generateStandup();
          break;
        case 'pr':
          await this.generatePR();
          break;
        case 'week':
          await this.generateWeek();
          break;
        case 'config':
          await this.showConfig();
          break;
        case 'refresh':
          await this.refresh();
          break;
        case 'exit':
          this.stop();
          break;
      }
    }
  }

  /**
   * Generate standup notes
   */
  private async generateStandup(): Promise<void> {
    const { days } = await inquirer.prompt([
      {
        type: 'list',
        name: 'days',
        message: 'Time range:',
        choices: [
          { name: 'Yesterday (1 day)', value: 1 },
          { name: 'Last 2 days', value: 2 },
          { name: 'Last 3 days', value: 3 },
          { name: 'Last week', value: 7 },
        ],
      },
    ]);

    const spinner = UI.spinner('Generating standup notes...');
    spinner.start();

    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const commits = await this.git.getCommits({ since });

      if (commits.length === 0) {
        spinner.stop();
        console.log(UI.warning(`No commits found in the last ${days} day(s)`));
        return;
      }

      const messages = commits.map((c) => c.message);
      const standup = await this.copilot.summarizeCommits(messages);

      spinner.stop();

      console.log('');
      console.log(UI.box(standup, 'Your Standup'));
      console.log(UI.stats([{ label: 'commits analyzed', value: commits.length }]));
      console.log('');

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What next?',
          choices: [
            { name: 'Copy to clipboard', value: 'copy' },
            { name: 'Back to dashboard', value: 'back' },
          ],
        },
      ]);

      if (action === 'copy') {
        await copyToClipboard(standup);
        console.log(UI.success('Copied to clipboard!'));
      }
    } catch (error) {
      spinner.stop();
      console.log(UI.error('Failed to generate standup'));
      console.log(colors.muted((error as Error).message));
    }
  }

  /**
   * Generate PR description
   */
  private async generatePR(): Promise<void> {
    const config = getConfig();

    const { base } = await inquirer.prompt([
      {
        type: 'input',
        name: 'base',
        message: 'Base branch:',
        default: config.pr.defaultBase,
      },
    ]);

    const spinner = UI.spinner('Analyzing branch...');
    spinner.start();

    try {
      const currentBranch = await this.git.getCurrentBranch();

      if (currentBranch === base) {
        spinner.stop();
        console.log(UI.error(`Cannot create PR from ${base} to ${base}`));
        return;
      }

      const commits = await this.git.getCommits();
      const files = await this.git.getChangedFiles(base);

      spinner.text = 'Generating PR description...';

      const description = await this.copilot.generatePRDescription({
        branch: currentBranch,
        commits: commits.map((c) => c.message),
        files,
        issues: [],
      });

      spinner.stop();

      console.log('');
      console.log(UI.box(description, `PR: ${currentBranch}`));
      console.log(
        UI.stats([
          { label: 'commits', value: commits.length },
          { label: 'files changed', value: files.length },
        ])
      );
      console.log('');

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What next?',
          choices: [
            { name: 'Copy to clipboard', value: 'copy' },
            { name: 'Back to dashboard', value: 'back' },
          ],
        },
      ]);

      if (action === 'copy') {
        await copyToClipboard(description);
        console.log(UI.success('Copied to clipboard!'));
        console.log(UI.info('Tip: Use `devdaily pr --create` to create PRs directly'));
      }
    } catch (error) {
      spinner.stop();
      console.log(UI.error('Failed to generate PR description'));
      console.log(colors.muted((error as Error).message));
    }
  }

  /**
   * Generate weekly summary
   */
  private async generateWeek(): Promise<void> {
    const spinner = UI.spinner('Generating weekly summary...');
    spinner.start();

    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const commits = await this.git.getCommits({ since });

      if (commits.length === 0) {
        spinner.stop();
        console.log(UI.warning('No commits found this week'));
        return;
      }

      const stats = await this.git.getDiffStats();
      const messages = commits.map((c) => c.message);

      const summary = await this.copilot.generateWeeklySummary({
        commits: messages,
        stats: {
          commits: commits.length,
          linesAdded: stats.insertions,
          linesRemoved: stats.deletions,
        },
      });

      spinner.stop();

      console.log('');
      console.log(UI.box(summary, 'Weekly Summary'));
      console.log(
        UI.stats([
          { label: 'commits', value: commits.length },
          { label: 'lines added', value: `+${stats.insertions}`, color: 'green' },
          { label: 'lines removed', value: `-${stats.deletions}`, color: 'red' },
        ])
      );
      console.log('');

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What next?',
          choices: [
            { name: 'Copy to clipboard', value: 'copy' },
            { name: 'Back to dashboard', value: 'back' },
          ],
        },
      ]);

      if (action === 'copy') {
        await copyToClipboard(summary);
        console.log(UI.success('Copied to clipboard!'));
      }
    } catch (error) {
      spinner.stop();
      console.log(UI.error('Failed to generate weekly summary'));
      console.log(colors.muted((error as Error).message));
    }
  }

  /**
   * Show configuration
   */
  private async showConfig(): Promise<void> {
    const config = getConfig();

    console.log('');
    console.log(UI.section('Configuration', ASCII.icons.config));
    console.log('');
    console.log(UI.keyValue('Theme', config.theme.primary));
    console.log(UI.keyValue('Default format', config.output.format));
    console.log(UI.keyValue('Copy to clipboard', config.output.copyToClipboard ? 'Yes' : 'No'));
    console.log(UI.keyValue('Default branch', config.pr.defaultBase));
    console.log(UI.keyValue('Week starts', config.week.startDay));
    console.log('');

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...',
      },
    ]);
  }

  /**
   * Refresh data
   */
  private async refresh(): Promise<void> {
    const spinner = UI.spinner('Refreshing...');
    spinner.start();

    await this.loadData();

    spinner.stop();
    this.render();

    console.log(UI.success('Data refreshed'));
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    this.isRunning = false;
    this.keyboard.stop();
    console.log('');
    console.log(UI.info('Goodbye!'));
  }
}

/**
 * Start the dashboard
 */
export const startDashboard = async (): Promise<void> => {
  const dashboard = new Dashboard();
  await dashboard.start();
};
