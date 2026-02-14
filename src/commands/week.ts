import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { StandupContextBuilder } from '../core/standup-context.js';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { copyToClipboard, getWeekStart, getWeekEnd, formatDateRange } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

export const weekCommand = new Command('week')
  .description('Generate weekly work summary from commits, PRs, and tickets')
  .option('-l, --last', 'Last week instead of current week')
  .option('-s, --start <date>', 'Custom start date (YYYY-MM-DD)')
  .option('--no-tickets', 'Skip fetching closed tickets/issues')
  .option('--no-prs', 'Skip fetching PR context')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--debug', 'Show the full context and prompt sent to Copilot')
  .option('--raw-context', 'Output only the raw context block (no AI generation)')
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const isDebug = options.debug || process.env.DEVD_DEBUG === '1';
    const copilot = new CopilotClient({ debug: isDebug });

    // Check if in git repo
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      process.exit(1);
    }

    // Check if Copilot CLI is installed (unless raw-context mode)
    if (!options.rawContext && !(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      console.log(UI.info('Install with: gh extension install github/gh-copilot'));
      process.exit(1);
    }

    const spinner = UI.spinner('Gathering weekly work context...');
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

      // Calculate days for the context builder
      const now = new Date();
      const daysSinceStart = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      // ── Phase 1: Build rich context using StandupContextBuilder ────────
      spinner.text = 'Analyzing git history, PRs, and tickets...';

      const contextBuilder = new StandupContextBuilder();
      const ctx = await contextBuilder.build({
        days: daysSinceStart,
        skipTickets: options.tickets === false,
        skipPRs: options.prs === false,
        baseBranch: config.git.defaultBranch,
        debug: isDebug,
      });

      if (ctx.commits.length === 0 && ctx.pullRequests.length === 0) {
        spinner.stop();
        console.log('');
        console.log(UI.warning('No commits or PRs found for this week'));
        process.exit(0);
      }

      spinner.stop();

      // ── Debug mode: show full context ──────────────────────────────────
      if (isDebug) {
        console.log('');
        console.log(colors.accent('─── Debug: Assembled Context ───'));
        console.log(StandupContextBuilder.formatDebugSummary(ctx));
        console.log('');
        console.log(colors.accent('─── Debug: Full Prompt Context Block ───'));
        console.log(colors.muted(StandupContextBuilder.formatForPrompt(ctx)));
        console.log('');
      }

      // ── Raw context mode: just output the context block ────────────────
      if (options.rawContext) {
        console.log('');
        console.log(StandupContextBuilder.formatForPrompt(ctx));
        return;
      }

      // ── Phase 2: Generate weekly summary with AI ───────────────────────
      const genSpinner = UI.spinner('Generating weekly summary with Copilot CLI...');
      genSpinner.start();

      const summary = await copilot.generateWeeklyFromContext(ctx);

      genSpinner.stop();

      // ── Phase 3: Output ────────────────────────────────────────────────
      const title = `${ASCII.icons.week} Week in Review (${formatDateRange(start, end)})`;

      console.log('');
      console.log(UI.box(summary, title));

      // Stats bar
      if (config.output.showStats) {
        const statItems: { label: string; value: string | number; color?: string }[] = [
          { label: 'commits', value: ctx.commits.length },
        ];
        if (ctx.diffStats) {
          statItems.push(
            { label: 'lines added', value: `+${ctx.diffStats.insertions}`, color: 'green' },
            { label: 'lines removed', value: `-${ctx.diffStats.deletions}`, color: 'red' }
          );
        }
        if (ctx.pullRequests.length > 0) {
          statItems.push({ label: 'PRs', value: ctx.pullRequests.length });
        }
        if (ctx.tickets.length > 0) {
          statItems.push({ label: 'tickets', value: ctx.tickets.length });
        }
        if (ctx.categories.length > 0) {
          statItems.push({ label: 'primary area', value: ctx.categories[0].name });
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

      if (isDebug && error instanceof Error && error.stack) {
        console.log('');
        console.log(colors.muted('Stack trace:'));
        console.log(colors.muted(error.stack));
      }

      process.exit(1);
    }
  });
