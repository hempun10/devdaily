import { Command } from 'commander';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import { StandupContextBuilder } from '../core/standup-context.js';
import { WorkJournal } from '../core/work-journal.js';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { copyToClipboard, getWeekStart, getWeekEnd, formatDateRange } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';
import { sideEffectSnapshot } from '../core/auto-snapshot.js';

const { colors } = UI;

export const weekCommand = new Command('week')
  .description('Generate weekly work summary from commits, PRs, tickets, and journal history')
  .option('-l, --last', 'Last week instead of current week')
  .option('-s, --start <date>', 'Custom start date (YYYY-MM-DD)')
  .option('--from <date>', 'Start date for custom range (YYYY-MM-DD)')
  .option('--to <date>', 'End date for custom range (YYYY-MM-DD)')
  .option('-w, --weeks-ago <number>', 'Number of weeks ago (e.g., 2 = two weeks back)')
  .option('--all-projects', 'Include all tracked projects from journal (cross-project summary)')
  .option('-p, --project <id>', 'Filter by specific project identifier')
  .option('--no-tickets', 'Skip fetching closed tickets/issues')
  .option('--no-prs', 'Skip fetching PR context')
  .option('--no-journal', 'Skip journal data (use only live git data)')
  .option('--no-auto-snapshot', 'Skip auto-saving a snapshot to the journal')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--save', 'Save the generated summary to the journal as an AI summary')
  .option('--debug', 'Show the full context and prompt sent to Copilot')
  .option('--raw-context', 'Output only the raw context block (no AI generation)')
  .option('--json', 'Output stats as JSON (no AI generation)')
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const isDebug = options.debug || process.env.DEVD_DEBUG === '1';
    const copilot = new CopilotClient({ debug: isDebug });
    const journal = new WorkJournal();

    // Check if in git repo (unless doing cross-project from journal)
    const isRepo = await git.isRepository();
    if (!isRepo && !options.allProjects) {
      console.log(UI.error('Not a git repository'));
      console.log(
        UI.info('Use --all-projects to generate a cross-project summary from your journal')
      );
      process.exit(1);
    }

    // Check if Copilot CLI is installed (unless raw-context or json mode)
    if (!options.rawContext && !options.json && !(await copilot.isInstalled())) {
      console.log(UI.error('GitHub Copilot CLI not found'));
      console.log(UI.info('Install with: gh extension install github/gh-copilot'));
      process.exit(1);
    }

    const spinner = UI.spinner('Gathering weekly work context...');
    spinner.start();

    try {
      // ── Determine date range ─────────────────────────────────────────────
      let start: Date;
      let end: Date;

      if (options.from || options.to) {
        // Custom range mode
        const today = new Date();
        start = options.from ? new Date(options.from) : getWeekStart(0);
        end = options.to ? new Date(options.to) : today;
        // Normalize end to end-of-day
        end.setHours(23, 59, 59, 999);
      } else if (options.start) {
        start = new Date(options.start);
        end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (options.weeksAgo) {
        const weeksAgo = parseInt(options.weeksAgo, 10) || 1;
        start = getWeekStart(weeksAgo);
        end = getWeekEnd(weeksAgo);
      } else {
        const weeksAgo = options.last ? 1 : 0;
        start = getWeekStart(weeksAgo);
        end = getWeekEnd(weeksAgo);
      }

      const startStr = dateToString(start);
      const endStr = dateToString(end);

      // Calculate days for the context builder
      const now = new Date();
      const daysSinceStart = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      // ── Cross-project mode (journal-based) ───────────────────────────────
      if (options.allProjects) {
        spinner.text = 'Gathering cross-project journal data...';

        const crossProjectSummary = journal.getCrossProjectSummary(startStr, endStr);
        const allSnapshots = journal.getSnapshotsForRange(null, startStr, endStr);

        spinner.stop();

        if (crossProjectSummary.projects.length === 0) {
          console.log('');
          console.log(UI.warning('No journal entries found for this period across any project'));
          console.log(UI.info('Take snapshots with: devdaily snapshot'));
          console.log(UI.info('Or run without --all-projects to use live git data for this repo'));
          process.exit(0);
        }

        // ── JSON mode for cross-project ──────────────────────────────────
        if (options.json) {
          console.log(JSON.stringify(crossProjectSummary, null, 2));
          return;
        }

        // ── Raw context mode for cross-project ───────────────────────────
        if (options.rawContext) {
          console.log('');
          console.log(WorkJournal.formatSnapshotsForAI(allSnapshots));
          return;
        }

        // ── Debug mode ───────────────────────────────────────────────────
        if (isDebug) {
          console.log('');
          console.log(colors.accent('─── Debug: Cross-Project Summary ───'));
          console.log(JSON.stringify(crossProjectSummary, null, 2));
          console.log('');
          console.log(colors.accent('─── Debug: Full Prompt Context Block ───'));
          console.log(colors.muted(WorkJournal.formatSnapshotsForAI(allSnapshots)));
          console.log('');
        }

        // ── Generate AI summary for cross-project ────────────────────────
        const genSpinner = UI.spinner(
          'Generating cross-project weekly summary with Copilot CLI...'
        );
        genSpinner.start();

        const contextBlock = WorkJournal.formatSnapshotsForAI(allSnapshots);
        const prompt = buildCrossProjectWeeklyPrompt(
          contextBlock,
          startStr,
          endStr,
          crossProjectSummary
        );
        const summary = await copilot.generateFromPrompt(prompt);

        genSpinner.stop();

        // ── Output cross-project summary ─────────────────────────────────
        const title = `${ASCII.icons.week} Cross-Project Week in Review (${formatDateRange(start, end)})`;

        console.log('');
        console.log(UI.box(summary, title));

        // Stats bar
        if (config.output.showStats) {
          const statItems: { label: string; value: string | number; color?: string }[] = [
            { label: 'projects', value: crossProjectSummary.projects.length },
            { label: 'active days', value: crossProjectSummary.totalActiveDays },
            { label: 'total commits', value: crossProjectSummary.totalCommits },
          ];

          // Aggregate diff stats
          const totalInsertions = crossProjectSummary.projects.reduce(
            (sum, p) => sum + p.diffStats.insertions,
            0
          );
          const totalDeletions = crossProjectSummary.projects.reduce(
            (sum, p) => sum + p.diffStats.deletions,
            0
          );
          if (totalInsertions > 0 || totalDeletions > 0) {
            statItems.push(
              { label: 'lines added', value: `+${totalInsertions}`, color: 'green' },
              { label: 'lines removed', value: `-${totalDeletions}`, color: 'red' }
            );
          }

          console.log(UI.stats(statItems));
        }

        // Per-project breakdown
        console.log('');
        console.log(UI.section('📂 Per-Project Breakdown'));
        console.log('');

        for (const project of crossProjectSummary.projects) {
          const diffInfo =
            project.diffStats.insertions + project.diffStats.deletions > 0
              ? `  ${colors.success(`+${project.diffStats.insertions}`)}/${colors.error(`-${project.diffStats.deletions}`)}`
              : '';

          console.log(
            `  ${colors.accent(project.projectId.padEnd(30))} ${project.totalCommits} commit${project.totalCommits !== 1 ? 's' : ''} · ${project.activeDays} day${project.activeDays !== 1 ? 's' : ''}${diffInfo}`
          );

          if (project.branches.length > 0) {
            console.log(
              `    ${colors.muted('Branches:')} ${project.branches.slice(0, 5).join(', ')}${project.branches.length > 5 ? ` +${project.branches.length - 5} more` : ''}`
            );
          }

          if (project.categories.length > 0) {
            const cats = project.categories
              .slice(0, 3)
              .map((c) => `${c.name}(${c.percentage}%)`)
              .join(', ');
            console.log(`    ${colors.muted('Areas:')} ${cats}`);
          }

          console.log('');
        }

        // Copy to clipboard
        if (options.copy && config.output.copyToClipboard !== false) {
          await copyToClipboard(summary);
          console.log(UI.success('Copied to clipboard'));
        }

        // Save to journal
        if (options.save) {
          for (const project of crossProjectSummary.projects) {
            const latestDate = endStr;
            journal.setAISummary(project.projectId, summary, latestDate);
          }
          console.log(UI.success('Summary saved to journal'));
        }

        console.log('');
        return;
      }

      // ── Single-project mode (live git + optional journal enrichment) ─────

      // Phase 1: Build rich context using StandupContextBuilder (live data)
      spinner.text = 'Analyzing git history, PRs, and tickets...';

      const contextBuilder = new StandupContextBuilder();
      const ctx = await contextBuilder.build({
        days: daysSinceStart,
        skipTickets: options.tickets === false,
        skipPRs: options.prs === false,
        baseBranch: config.git.defaultBranch,
        debug: isDebug,
      });

      // Phase 1b: Enrich with journal data if available
      let journalSnapshots = null;
      let journalContext = '';

      if (options.journal !== false) {
        const projectId = options.project || null;
        const snapshots = journal.getSnapshotsForRange(projectId, startStr, endStr);

        if (snapshots.length > 0) {
          journalSnapshots = snapshots;
          journalContext = WorkJournal.formatSnapshotsForAI(snapshots);

          if (isDebug) {
            console.log('');
            console.log(colors.accent(`─── Debug: Journal Entries (${snapshots.length}) ───`));
            console.log(colors.muted(journalContext.slice(0, 2000)));
            if (journalContext.length > 2000) {
              console.log(colors.muted(`... (${journalContext.length - 2000} more chars)`));
            }
            console.log('');
          }
        }
      }

      if (ctx.commits.length === 0 && ctx.pullRequests.length === 0 && !journalSnapshots) {
        spinner.stop();
        console.log('');
        console.log(UI.warning('No commits, PRs, or journal entries found for this week'));
        console.log(
          UI.info(
            'Try a different date range with --from / --to, or take snapshots with: devdaily snapshot'
          )
        );
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

      // ── JSON mode ──────────────────────────────────────────────────────
      if (options.json) {
        const jsonData = {
          dateRange: { from: startStr, to: endStr },
          commits: ctx.commits.length,
          pullRequests: ctx.pullRequests.length,
          tickets: ctx.tickets.length,
          diffStats: ctx.diffStats,
          categories: ctx.categories,
          topChangedFiles: ctx.topChangedFiles,
          branch: ctx.branch,
          journalEntries: journalSnapshots?.length || 0,
        };
        console.log(JSON.stringify(jsonData, null, 2));
        return;
      }

      // ── Raw context mode: just output the context block ────────────────
      if (options.rawContext) {
        console.log('');
        console.log(StandupContextBuilder.formatForPrompt(ctx));
        if (journalContext) {
          console.log('');
          console.log('--- JOURNAL HISTORY ---');
          console.log(journalContext);
        }
        return;
      }

      // ── Phase 2: Generate weekly summary with AI ───────────────────────
      const genSpinner = UI.spinner('Generating weekly summary with Copilot CLI...');
      genSpinner.start();

      let summary: string;

      if (journalContext) {
        // Enhanced prompt with journal context
        const contextBlock = StandupContextBuilder.formatForPrompt(ctx);
        const prompt = buildEnhancedWeeklyPrompt(contextBlock, journalContext, startStr, endStr);
        summary = await copilot.generateFromPrompt(prompt);
      } else {
        summary = await copilot.generateWeeklyFromContext(ctx);
      }

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
        if (journalSnapshots) {
          statItems.push({ label: 'journal days', value: journalSnapshots.length });
        }
        console.log(UI.stats(statItems));
      }
      console.log('');

      // Copy to clipboard
      if (options.copy && config.output.copyToClipboard !== false) {
        await copyToClipboard(summary);
        console.log(UI.success('Copied to clipboard'));
      }

      // Save to journal
      if (options.save) {
        try {
          // Detect project ID for saving
          let projectIdForSave = options.project;
          if (!projectIdForSave && journalSnapshots && journalSnapshots.length > 0) {
            projectIdForSave = journalSnapshots[0].projectId;
          }
          if (!projectIdForSave) {
            projectIdForSave = WorkJournal.sanitizeProjectId(
              ctx.repo.name || process.cwd().split('/').pop() || 'unknown'
            );
          }

          journal.setAISummary(projectIdForSave, summary, endStr);
          console.log(UI.success('Summary saved to journal'));
        } catch (err) {
          console.log(UI.warning(`Could not save to journal: ${(err as Error).message}`));
        }
      }

      // ── Auto-snapshot side-effect ──────────────────────────────────────
      if (options.autoSnapshot !== false) {
        await sideEffectSnapshot({
          source: 'week',
          note: `Weekly summary generated (${startStr} → ${endStr})`,
          debug: isDebug,
        });
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildEnhancedWeeklyPrompt(
  liveContext: string,
  journalContext: string,
  fromDate: string,
  toDate: string
): string {
  return `You are a developer assistant generating a weekly work summary for the period ${fromDate} to ${toDate}.

You have TWO sources of data:
1. LIVE GIT DATA — commits, PRs, tickets from the current repo (most accurate for current state)
2. JOURNAL HISTORY — saved snapshots from previous days (provides historical context and continuity)

Generate a clear, well-structured weekly summary with these sections:

## Accomplishments
- List the key things completed this week
- Group related commits into logical accomplishments
- Reference PR numbers and ticket IDs where available

## In Progress
- Work that's started but not yet complete
- Open PRs, active branches, pending reviews

## Key Metrics
- Lines changed, files touched, PRs merged
- Work area breakdown (frontend, backend, etc.)

## Notable Items
- Any breaking changes, new features, or significant refactors
- Cross-cutting concerns or patterns you notice

Rules:
- Be concise but comprehensive
- Use bullet points
- Reference specific PR numbers (#N), ticket IDs, and branch names
- Don't hallucinate — only use information from the provided data
- If journal data shows work on multiple days, show the progression
- Highlight continuity: work that spans multiple days or builds on earlier work

---
LIVE GIT DATA:
${liveContext}

---
JOURNAL HISTORY:
${journalContext}

---
Generate the weekly summary now:`;
}

function buildCrossProjectWeeklyPrompt(
  journalContext: string,
  fromDate: string,
  toDate: string,
  crossProjectSummary: {
    projects: {
      projectId: string;
      totalCommits: number;
      activeDays: number;
      branches: string[];
      categories: { name: string; percentage: number }[];
      diffStats: { filesChanged: number; insertions: number; deletions: number };
    }[];
    totalCommits: number;
    totalActiveDays: number;
  }
): string {
  const projectList = crossProjectSummary.projects
    .map(
      (p) =>
        `- ${p.projectId}: ${p.totalCommits} commits across ${p.activeDays} days, branches: ${p.branches.slice(0, 5).join(', ')}`
    )
    .join('\n');

  return `You are a developer assistant generating a CROSS-PROJECT weekly summary for ${fromDate} to ${toDate}.

This developer worked on ${crossProjectSummary.projects.length} project(s) this week with ${crossProjectSummary.totalCommits} total commits across ${crossProjectSummary.totalActiveDays} active days.

Projects overview:
${projectList}

Generate a summary that:

## Week Overview
- High-level: what was this week about? What were the main themes across all projects?
- How was time split between projects?

## Per-Project Highlights
- For each project, summarize the key accomplishments (2-3 bullets each)
- Reference specific branches, PRs, and tickets

## Cross-Cutting Themes
- Any patterns across projects (e.g., "infrastructure week", "bug-fix sprint")
- Context switching patterns — how many projects were touched per day?

## This Week in Numbers
- Commits, PRs, files changed across all projects
- Most active project and most active day

Rules:
- Be concise — this is a high-level view, not a detailed log
- Organize by project, then highlight cross-project themes
- Don't hallucinate — only use information from the data
- Reference specific branch names and commit messages when they tell a story
- If a project had no activity, don't mention it

---
JOURNAL DATA:
${journalContext}

---
Generate the cross-project weekly summary now:`;
}
