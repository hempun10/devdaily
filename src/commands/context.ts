import { Command } from 'commander';
import { SnapshotBuilder } from '../core/snapshot-builder.js';
import { WorkJournal } from '../core/work-journal.js';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { CopilotClient } from '../core/copilot.js';
import UI from '../ui/renderer.js';
import { copyToClipboard } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

export const contextCommand = new Command('context')
  .description('Recover what you were working on — fight context switching amnesia')
  .option('-d, --days <number>', 'Number of days to look back', '7')
  .option('-p, --project <id>', 'Filter by project identifier')
  .option('--all-projects', 'Show context across all tracked projects')
  .option('--date <date>', 'Show context for a specific date (YYYY-MM-DD)')
  .option('--from <date>', 'Start date for range (YYYY-MM-DD)')
  .option('--to <date>', 'End date for range (YYYY-MM-DD)')
  .option('--ai', 'Generate an AI-powered "where did I leave off?" summary')
  .option('--branches', 'Show detailed active branch status')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--raw', 'Output raw context data (no formatting)')
  .option('--debug', 'Show debug output')
  .action(async (options) => {
    const config = getConfig();
    const git = new GitAnalyzer();
    const isDebug = options.debug || process.env.DEVD_DEBUG === '1';
    const journal = new WorkJournal();

    // ── Determine date range ───────────────────────────────────────────────
    let fromDate: string;
    let toDate: string;

    if (options.date) {
      fromDate = options.date;
      toDate = options.date;
    } else if (options.from || options.to) {
      const today = journal.todayString();
      fromDate = options.from || today;
      toDate = options.to || today;
    } else {
      const days = parseInt(options.days, 10) || 7;
      const from = new Date();
      from.setDate(from.getDate() - days);
      fromDate = journal.dateToString(from);
      toDate = journal.todayString();
    }

    // ── Check if we have journal data ──────────────────────────────────────
    const projectId = options.project || null;
    const snapshots = journal.getSnapshotsForRange(
      options.allProjects ? null : projectId,
      fromDate,
      toDate
    );

    // If no journal data, try to take a live snapshot first
    if (snapshots.length === 0 && !options.allProjects) {
      if (await git.isRepository()) {
        console.log('');
        console.log(
          UI.info('No journal entries found. Taking a live snapshot of your current project...')
        );
        console.log('');

        const spinner = UI.spinner('Analyzing current project state...');
        spinner.start();

        try {
          const builder = new SnapshotBuilder(undefined, isDebug);
          const result = await builder.takeAndSave({ debug: isDebug });
          snapshots.push(result.snapshot);
          spinner.stop();
          console.log(
            UI.success(
              `Snapshot saved for ${result.snapshot.projectId}. Future runs will have history.`
            )
          );
          console.log('');
        } catch (err) {
          spinner.stop();
          console.log(UI.warning(`Could not take snapshot: ${(err as Error).message}`));
          console.log('');
        }
      }
    }

    if (snapshots.length === 0) {
      console.log('');
      console.log(UI.warning('No work context found for the specified period.'));
      console.log('');
      console.log(UI.info('To start building your work journal:'));
      console.log(`  ${colors.accent('devdaily snapshot')}          Take a snapshot now`);
      console.log(`  ${colors.accent('devdaily snapshot --list')}    View your journal entries`);
      console.log(`  ${colors.accent('devdaily context --days=14')} Look further back`);
      console.log('');
      return;
    }

    // ── Group snapshots by project ─────────────────────────────────────────
    const byProject = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const existing = byProject.get(s.projectId);
      if (existing) {
        existing.push(s);
      } else {
        byProject.set(s.projectId, [s]);
      }
    }

    // ── Raw mode ───────────────────────────────────────────────────────────
    if (options.raw) {
      console.log(WorkJournal.formatSnapshotsForAI(snapshots));
      return;
    }

    // ── Render context recovery ────────────────────────────────────────────
    console.log('');

    const dateRangeLabel = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;

    console.log(UI.section(`🧠 Context Recovery — ${dateRangeLabel}`));
    console.log('');

    for (const [pid, projectSnapshots] of byProject) {
      const sortedSnapshots = projectSnapshots.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const latestSnapshot = sortedSnapshots[0];
      const totalCommits = sortedSnapshots.reduce((sum, s) => sum + s.todayCommits.length, 0);
      const activeDays = sortedSnapshots.length;

      // ── Project header ───────────────────────────────────────────────
      console.log(`  ${colors.accent('━━━')} 📂 ${colors.accent(pid)} ${colors.accent('━━━')}`);
      console.log(`  ${colors.muted(latestSnapshot.repoPath)}`);
      console.log(
        `  ${activeDays} active day${activeDays !== 1 ? 's' : ''} · ${totalCommits} commit${totalCommits !== 1 ? 's' : ''}`
      );
      console.log('');

      // ── Current state (from most recent snapshot) ────────────────────
      console.log(`  ${colors.accent('Current branch:')} ${latestSnapshot.currentBranch}`);

      if (latestSnapshot.activeBranches.length > 0) {
        // Find branches with work-in-progress
        const wipBranches = latestSnapshot.activeBranches.filter(
          (b) => b.aheadOfBase > 0 || b.hasUncommittedChanges
        );

        if (wipBranches.length > 0 || options.branches) {
          const branchesToShow = options.branches ? latestSnapshot.activeBranches : wipBranches;

          console.log('');
          console.log(
            `  ${colors.accent('Active branches')} ${colors.muted(`(${branchesToShow.length}):`)}`
          );

          for (const branch of branchesToShow.slice(0, 15)) {
            const isCurrent = branch.name === latestSnapshot.currentBranch;
            const marker = isCurrent ? colors.success(' ← you are here') : '';
            let status = '';

            if (branch.aheadOfBase > 0) {
              status += colors.warning(` ↑${branch.aheadOfBase} ahead`);
            }
            if (branch.hasUncommittedChanges) {
              status += colors.error(' ● uncommitted changes');
            }

            console.log(
              `    ${isCurrent ? colors.accent('▸') : ' '} ${branch.name}${marker}${status}`
            );
            if (branch.lastCommitMessage) {
              console.log(
                `      ${colors.muted(`Last: ${branch.lastCommitMessage.slice(0, 60)}`)}`
              );
            }
            if (branch.hasUncommittedChanges && branch.uncommittedFiles.length > 0) {
              const fileList = branch.uncommittedFiles.slice(0, 5).join(', ');
              const more =
                branch.uncommittedFiles.length > 5
                  ? ` +${branch.uncommittedFiles.length - 5} more`
                  : '';
              console.log(`      ${colors.muted(`Modified: ${fileList}${more}`)}`);
            }
          }

          if (branchesToShow.length > 15) {
            console.log(
              `    ${colors.muted(`... and ${branchesToShow.length - 15} more branches`)}`
            );
          }
        }
      }

      // ── Recent activity timeline ─────────────────────────────────────
      console.log('');
      console.log(`  ${colors.accent('Activity timeline:')}`);

      for (const snapshot of sortedSnapshots.slice(0, 10)) {
        const isToday = snapshot.date === journal.todayString();
        const dateLabel = isToday ? `${snapshot.date} ${colors.success('(today)')}` : snapshot.date;

        const commitCount = snapshot.todayCommits.length;
        const prInfo =
          snapshot.pullRequests.length > 0
            ? ` · ${snapshot.pullRequests.length} PR${snapshot.pullRequests.length !== 1 ? 's' : ''}`
            : '';

        const diffInfo = snapshot.diffStats
          ? ` · ${colors.success(`+${snapshot.diffStats.insertions}`)}/${colors.error(`-${snapshot.diffStats.deletions}`)}`
          : '';

        console.log(
          `    ${colors.accent('│')} ${dateLabel}  🌿 ${snapshot.currentBranch}  📝 ${commitCount}${prInfo}${diffInfo}`
        );

        // Show top commits for each day
        for (const commit of snapshot.todayCommits.slice(0, 3)) {
          console.log(
            `    ${colors.accent('│')}   ${colors.muted(commit.shortHash)} ${commit.message.slice(0, 55)}`
          );
        }
        if (snapshot.todayCommits.length > 3) {
          console.log(
            `    ${colors.accent('│')}   ${colors.muted(`... +${snapshot.todayCommits.length - 3} more commits`)}`
          );
        }

        // Show notes if present
        if (snapshot.notes) {
          console.log(
            `    ${colors.accent('│')}   ${colors.warning('📌')} ${snapshot.notes.split('\n')[0].slice(0, 55)}`
          );
        }
      }

      if (sortedSnapshots.length > 10) {
        console.log(
          `    ${colors.accent('│')} ${colors.muted(`... ${sortedSnapshots.length - 10} more days`)}`
        );
      }
      console.log(`    ${colors.accent('╵')}`);

      // ── PRs ──────────────────────────────────────────────────────────
      const allPRs = new Map<number, (typeof latestSnapshot.pullRequests)[0]>();
      for (const s of sortedSnapshots) {
        for (const pr of s.pullRequests) {
          allPRs.set(pr.number, pr);
        }
      }

      if (allPRs.size > 0) {
        console.log('');
        console.log(`  ${colors.accent('Pull Requests:')}`);
        for (const pr of allPRs.values()) {
          const stateIcon =
            pr.state === 'open'
              ? colors.success('○')
              : pr.state === 'merged'
                ? colors.accent('●')
                : colors.muted('✕');
          console.log(`    ${stateIcon} #${pr.number} ${pr.title.slice(0, 55)} (${pr.state})`);
        }
      }

      // ── Tickets ──────────────────────────────────────────────────────
      const allTickets = new Map<string, (typeof latestSnapshot.tickets)[0]>();
      for (const s of sortedSnapshots) {
        for (const t of s.tickets) {
          allTickets.set(t.id, t);
        }
      }

      if (allTickets.size > 0) {
        console.log('');
        console.log(`  ${colors.accent('Tickets:')}`);
        for (const ticket of allTickets.values()) {
          const titlePart = ticket.title ? `: ${ticket.title.slice(0, 50)}` : '';
          console.log(`    ${ticket.id}${titlePart} ${colors.muted(`[${ticket.status}]`)}`);
        }
      }

      // ── Work areas ───────────────────────────────────────────────────
      const catMap = new Map<string, number[]>();
      for (const s of sortedSnapshots) {
        for (const cat of s.categories) {
          const existing = catMap.get(cat.name);
          if (existing) {
            existing.push(cat.percentage);
          } else {
            catMap.set(cat.name, [cat.percentage]);
          }
        }
      }

      if (catMap.size > 0) {
        console.log('');
        console.log(`  ${colors.accent('Work areas:')}`);
        const categories = Array.from(catMap.entries())
          .map(([name, percentages]) => ({
            name,
            avgPercentage: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
          }))
          .sort((a, b) => b.avgPercentage - a.avgPercentage)
          .slice(0, 5);

        for (const cat of categories) {
          const barFilled = Math.round(cat.avgPercentage / 5);
          const barEmpty = 20 - barFilled;
          const bar = '█'.repeat(barFilled) + '░'.repeat(barEmpty);
          console.log(`    ${cat.name.padEnd(14)} ${bar} ${cat.avgPercentage}%`);
        }
      }

      console.log('');
    }

    // ── AI-powered summary ─────────────────────────────────────────────────
    if (options.ai) {
      const copilot = new CopilotClient({ debug: isDebug });

      if (!(await copilot.isInstalled())) {
        console.log(
          UI.warning(
            'GitHub Copilot CLI not found — skipping AI summary. Install with: gh extension install github/gh-copilot'
          )
        );
      } else {
        const genSpinner = UI.spinner('Generating "where did I leave off?" summary with AI...');
        genSpinner.start();

        try {
          const contextBlock = WorkJournal.formatSnapshotsForAI(snapshots);

          const prompt = buildContextRecoveryPrompt(contextBlock, fromDate, toDate);
          const summary = await copilot.generateFromPrompt(prompt);

          genSpinner.stop();

          console.log(UI.box(summary, '🧠 Where You Left Off'));
          console.log('');

          // Copy to clipboard
          if (options.copy !== false && config.output.copyToClipboard !== false) {
            await copyToClipboard(summary);
            console.log(UI.success('Copied to clipboard'));
            console.log('');
          }
        } catch (err) {
          genSpinner.stop();
          console.log(UI.warning(`AI summary failed: ${(err as Error).message}`));
          console.log('');
        }
      }
    }

    // ── Helpful tips ───────────────────────────────────────────────────────
    if (!options.ai) {
      console.log(
        colors.muted(
          `  Tip: Add ${colors.accent('--ai')} for an AI-powered "where did I leave off?" summary`
        )
      );
      console.log(
        colors.muted(`       Add ${colors.accent('--branches')} for detailed branch status`)
      );
      console.log('');
    }
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildContextRecoveryPrompt(
  contextBlock: string,
  fromDate: string,
  toDate: string
): string {
  return `You are a developer assistant helping me recover my work context after time away or context switching.

Below is a journal of my recent development activity from ${fromDate} to ${toDate}, including commits, branches, PRs, tickets, and file changes.

Your job is to give me a concise, actionable "where I left off" briefing. Structure it as:

1. **What I was working on** — The main themes/features/tasks (2-3 sentences max)
2. **Current state** — What's in progress, what's done, what's pending
3. **Open threads** — Branches with uncommitted work, open PRs needing attention, unfinished tasks
4. **Suggested next steps** — What I should probably pick up first based on the activity pattern

Rules:
- Be concise and practical — this is for getting back up to speed quickly
- Reference specific branch names, PR numbers, and ticket IDs when available
- Don't invent or hallucinate details that aren't in the data
- If multiple projects are present, organize by project
- Use bullet points for readability

---
WORK JOURNAL DATA:
${contextBlock}
---

Generate the context recovery briefing now:`;
}
