import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import {
  StandupContextBuilder,
  type StandupContext,
  type StandupContextOptions,
} from '../core/standup-context.js';
import { sendNotification, formatStandupNotification } from '../core/notifications.js';
import UI from '../ui/renderer.js';
import { copyToClipboard } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

export const standupCommand = new Command('standup')
  .description('Generate standup notes from your recent commits, PRs, and tickets')
  .option('-d, --days <number>', 'Number of days to look back', '1')
  .option('-f, --format <type>', 'Output format (markdown|slack|plain|json)', 'markdown')
  .option('-a, --author <email>', 'Filter by author email')
  .option('-t, --ticket <id...>', 'Include specific ticket/issue IDs for context')
  .option('--tone <type>', 'Output tone (engineering|mixed|business)', 'mixed')
  .option('--no-tickets', 'Skip fetching ticket/issue context')
  .option('--no-prs', 'Skip fetching PR context')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--debug', 'Show the full context and prompt sent to Copilot')
  .option('--preview', 'Show assembled context and ask for confirmation before generating')
  .option('--context', 'Show detailed work context analysis')
  .option('--raw-context', 'Output only the raw context block (no AI generation)')
  .option('--send', 'Send to configured notification channels (Slack/Discord)')
  .option('--slack', 'Send to Slack')
  .option('--discord', 'Send to Discord')
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const isDebug = options.debug || process.env.DEVD_DEBUG === '1';
    const copilot = new CopilotClient({ debug: isDebug });

    // Check if in git repo
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      console.log(UI.info('Run this command inside a git repository'));
      process.exit(1);
    }

    // Check if Copilot CLI is installed (unless raw-context mode)
    if (!options.rawContext && !(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      console.log(UI.info('Install with: gh extension install github/gh-copilot'));
      process.exit(1);
    }

    const spinner = UI.spinner('Gathering work context...');
    spinner.start();

    try {
      const days = parseInt(options.days, 10) || config.standup.defaultDays;
      const tone = validateTone(options.tone);

      // ── Phase 1: Build rich context ──────────────────────────────────────
      spinner.text = 'Analyzing git history...';

      const contextBuilder = new StandupContextBuilder();
      const contextOptions: StandupContextOptions = {
        days,
        author: options.author,
        ticketIds: options.ticket,
        skipTickets: options.tickets === false,
        skipPRs: options.prs === false,
        baseBranch: config.git.defaultBranch,
        debug: isDebug,
      };

      // Update spinner as we gather data
      const originalBuild = contextBuilder.build.bind(contextBuilder);
      spinner.text = 'Fetching commits, PRs, and tickets...';

      const ctx: StandupContext = await originalBuild(contextOptions);

      // Check if we have any data
      if (ctx.commits.length === 0 && ctx.pullRequests.length === 0) {
        spinner.stop();
        console.log('');
        console.log(UI.warning(`No commits or PRs found in the last ${days} day(s)`));
        console.log(UI.info(`Try: devdaily standup --days=${days + 1}`));
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

      // ── Context analysis mode ──────────────────────────────────────────
      if (options.context) {
        printContextAnalysis(ctx);
      }

      // ── Raw context mode: just output the context block ────────────────
      if (options.rawContext) {
        console.log('');
        console.log(StandupContextBuilder.formatForPrompt(ctx));
        return;
      }

      // ── Preview mode: show context and ask for confirmation ────────────
      if (options.preview) {
        console.log('');
        console.log(UI.section('Assembled Context'));
        console.log('');
        printContextSummary(ctx);
        console.log('');

        const { default: inquirer } = await import('inquirer');
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Generate standup from this context?',
            default: true,
          },
        ]);

        if (!proceed) {
          console.log(UI.info('Aborted. You can adjust with --days, --ticket, --author flags.'));
          return;
        }
      }

      // ── Phase 2: Generate standup with AI ──────────────────────────────
      const genSpinner = UI.spinner('Generating standup with Copilot CLI...');
      genSpinner.start();

      const standup = await copilot.generateStandupFromContext(ctx, tone);

      genSpinner.stop();

      // ── Phase 3: Output ────────────────────────────────────────────────
      const title = days === 1 ? 'Your Standup' : `Your Work (Last ${days} Days)`;

      console.log('');
      console.log(UI.box(standup, title));

      // Stats bar
      if (config.output.showStats) {
        const statItems: { label: string; value: string | number }[] = [
          { label: 'commits', value: ctx.commits.length },
          { label: 'days', value: days },
        ];
        if (ctx.pullRequests.length > 0) {
          statItems.push({ label: 'PRs', value: ctx.pullRequests.length });
        }
        if (ctx.tickets.length > 0) {
          statItems.push({ label: 'tickets', value: ctx.tickets.length });
        }
        if (ctx.categories.length > 0) {
          statItems.push({
            label: 'primary area',
            value: ctx.categories[0].name,
          });
        }
        if (ctx.diffStats) {
          statItems.push({
            label: 'changes',
            value: `+${ctx.diffStats.insertions}/-${ctx.diffStats.deletions}`,
          });
        }
        console.log(UI.stats(statItems));
      }
      console.log('');

      // ── Copy to clipboard ──────────────────────────────────────────────
      if (options.copy && config.output.copyToClipboard !== false) {
        await copyToClipboard(standup);
        console.log(UI.success('Copied to clipboard'));
      }

      // ── Send to notifications ──────────────────────────────────────────
      if (options.send || options.slack || options.discord) {
        const ticketLinks = ctx.tickets.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
        }));

        const notification = formatStandupNotification(standup, ticketLinks);

        const sendToSlack = options.slack || options.send;
        const sendToDiscord = options.discord || options.send;

        const results = await sendNotification(notification, {
          slack: sendToSlack,
          discord: sendToDiscord,
        });

        if (results.slack) {
          console.log(UI.success('Sent to Slack'));
        }
        if (results.discord) {
          console.log(UI.success('Sent to Discord'));
        }
        if (results.slack === false || results.discord === false) {
          console.log(
            UI.warning('Some notifications failed to send. Check your webhook configuration.')
          );
        }
      }
    } catch (error) {
      spinner.stop();
      console.log('');
      console.log(UI.error('Failed to generate standup'));
      console.log(colors.muted((error as Error).message));

      if (isDebug && error instanceof Error && error.stack) {
        console.log('');
        console.log(colors.muted('Stack trace:'));
        console.log(colors.muted(error.stack));
      }

      process.exit(1);
    }
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateTone(tone: string): 'engineering' | 'mixed' | 'business' {
  const valid = ['engineering', 'mixed', 'business'];
  if (valid.includes(tone)) {
    return tone as 'engineering' | 'mixed' | 'business';
  }
  console.log(UI.warning(`Invalid tone "${tone}". Using "mixed". Options: ${valid.join(', ')}`));
  return 'mixed';
}

/**
 * Print a compact summary of the assembled context
 */
function printContextSummary(ctx: StandupContext): void {
  // Commits
  console.log(`  ${colors.accent('Commits:')} ${ctx.commits.length}`);
  for (const c of ctx.commits.slice(0, 8)) {
    console.log(`    ${colors.muted(`[${c.shortHash}]`)} ${c.message.slice(0, 70)}`);
  }
  if (ctx.commits.length > 8) {
    console.log(`    ${colors.muted(`... and ${ctx.commits.length - 8} more`)}`);
  }

  // PRs
  if (ctx.pullRequests.length > 0) {
    console.log('');
    console.log(`  ${colors.accent('Pull Requests:')} ${ctx.pullRequests.length}`);
    for (const pr of ctx.pullRequests) {
      const state = pr.state === 'open' ? colors.success('open') : colors.muted(pr.state);
      console.log(`    PR #${pr.number} ${pr.title.slice(0, 55)} (${state})`);
    }
  }

  // Tickets
  if (ctx.tickets.length > 0) {
    console.log('');
    console.log(`  ${colors.accent('Tickets:')} ${ctx.tickets.length}`);
    for (const t of ctx.tickets) {
      console.log(`    ${t.id}: ${t.title.slice(0, 55)} [${t.status}]`);
    }
  } else if (ctx.ticketIds.length > 0) {
    console.log('');
    console.log(`  ${colors.accent('Ticket IDs found:')} ${ctx.ticketIds.join(', ')}`);
    console.log(`    ${colors.muted('(details not fetched — PM tool may not be configured)')}`);
  }

  // Diff stats
  if (ctx.diffStats) {
    console.log('');
    console.log(
      `  ${colors.accent('Changes:')} ${ctx.diffStats.filesChanged} files, ` +
        `${colors.success(`+${ctx.diffStats.insertions}`)} / ` +
        `${colors.error(`-${ctx.diffStats.deletions}`)}`
    );
  }

  // Top files
  if (ctx.topChangedFiles.length > 0) {
    console.log('');
    console.log(`  ${colors.accent('Top changed files:')}`);
    for (const f of ctx.topChangedFiles.slice(0, 5)) {
      const freq = f.frequency > 1 ? ` ${colors.muted(`(${f.frequency}x)`)}` : '';
      console.log(`    ${f.path}${freq}`);
    }
  }
}

/**
 * Print full context analysis (--context flag)
 */
function printContextAnalysis(ctx: StandupContext): void {
  console.log('');
  console.log(UI.section('Work Context Analysis'));
  console.log('');

  // Branch & repo
  if (ctx.repo.name) {
    console.log(`  ${colors.accent('Repository:')} ${ctx.repo.name}`);
  }
  console.log(`  ${colors.accent('Branch:')} ${ctx.branch}`);
  console.log(
    `  ${colors.accent('Period:')} ${ctx.timeRange.since.toLocaleDateString()} → ${ctx.timeRange.until.toLocaleDateString()} (${ctx.timeRange.durationHours}h)`
  );
  console.log('');

  // Commits
  console.log(`  ${colors.accent('Commits:')} ${ctx.commits.length}`);
  for (const c of ctx.commits) {
    const files = c.filesChanged ? ` (${c.filesChanged.length} files)` : '';
    console.log(`    ${colors.muted(c.shortHash)} ${c.message}${colors.muted(files)}`);
  }
  console.log('');

  // PRs
  if (ctx.pullRequests.length > 0) {
    console.log(`  ${colors.accent('Pull Requests:')} ${ctx.pullRequests.length}`);
    for (const pr of ctx.pullRequests) {
      console.log(`    #${pr.number} ${pr.title} (${pr.state}) → ${pr.baseBranch}`);
      if (pr.linkedTickets.length > 0) {
        console.log(`      ${colors.muted(`Linked: ${pr.linkedTickets.join(', ')}`)}`);
      }
    }
    console.log('');
  }

  // Tickets
  if (ctx.tickets.length > 0) {
    console.log(`  ${colors.accent('Tickets:')}`);
    for (const t of ctx.tickets) {
      const priority = t.priority ? ` [${t.priority}]` : '';
      console.log(`    ${t.id}: ${t.title} (${t.type}, ${t.status}${priority})`);
    }
    console.log('');
  }

  // Work categories
  if (ctx.categories.length > 0) {
    console.log(`  ${colors.accent('Work Categories:')}`);
    for (const cat of ctx.categories.slice(0, 5)) {
      const barFilled = Math.round(cat.percentage / 5);
      const barEmpty = 20 - barFilled;
      const bar = '█'.repeat(barFilled) + '░'.repeat(barEmpty);
      console.log(`    ${cat.name.padEnd(14)} ${bar} ${cat.percentage}%`);
    }
    console.log('');
  }

  // Diff stats
  if (ctx.diffStats) {
    console.log(
      `  ${colors.accent('Diff Stats:')} ${ctx.diffStats.filesChanged} files, ` +
        `+${ctx.diffStats.insertions}/-${ctx.diffStats.deletions} lines`
    );
    console.log('');
  }

  // Top changed files
  if (ctx.topChangedFiles.length > 0) {
    console.log(`  ${colors.accent('Top Changed Files:')}`);
    for (const f of ctx.topChangedFiles.slice(0, 10)) {
      const freq = f.frequency > 1 ? ` ${colors.muted(`(touched in ${f.frequency} commits)`)}` : '';
      console.log(`    ${f.path}${freq}`);
    }
    console.log('');
  }
}
