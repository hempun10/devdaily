import { Command } from 'commander';
import { SnapshotBuilder } from '../core/snapshot-builder.js';
import { WorkJournal } from '../core/work-journal.js';
import { GitAnalyzer } from '../core/git-analyzer.js';
import UI from '../ui/renderer.js';

const { colors } = UI;

export const snapshotCommand = new Command('snapshot')
  .description('Save a snapshot of your current work state to your local journal')
  .option('-d, --date <date>', 'Snapshot date (YYYY-MM-DD, default: today)')
  .option('-p, --project <id>', 'Override project identifier')
  .option('-n, --note <text>', 'Attach a note to this snapshot')
  .option('-t, --tag <tags...>', 'Add custom tags to the snapshot')
  .option('--no-prs', 'Skip fetching PR data')
  .option('--no-tickets', 'Skip fetching ticket data')
  .option('--no-branches', 'Skip listing active branches')
  .option('--light', 'Quick snapshot — commits and branch info only (no PRs/tickets)')
  .option('--debug', 'Show detailed debug output')
  .option('--stats', 'Show journal storage stats instead of taking a snapshot')
  .option('--list [days]', 'List recent snapshots (default: 7 days)')
  .option('--prune <days>', 'Remove journal entries older than N days')
  .action(async (options) => {
    const git = new GitAnalyzer();
    const isDebug = options.debug || process.env.DEVD_DEBUG === '1';

    // ── Stats mode ─────────────────────────────────────────────────────────
    if (options.stats) {
      const journal = new WorkJournal();
      const stats = journal.getStats();

      console.log('');
      console.log(UI.section('📓 Journal Stats'));
      console.log('');
      console.log(`  ${colors.accent('Total snapshots:')}  ${stats.totalSnapshots}`);
      console.log(`  ${colors.accent('Active dates:')}     ${stats.totalDates}`);
      console.log(`  ${colors.accent('Projects tracked:')} ${stats.totalProjects}`);
      console.log(
        `  ${colors.accent('Oldest entry:')}     ${stats.oldestEntry || colors.muted('none')}`
      );
      console.log(
        `  ${colors.accent('Newest entry:')}     ${stats.newestEntry || colors.muted('none')}`
      );
      console.log(`  ${colors.accent('Storage used:')}     ${formatBytes(stats.storageBytes)}`);
      console.log('');

      const projects = journal.getProjects();
      if (projects.length > 0) {
        console.log(UI.section('📂 Tracked Projects'));
        console.log('');
        for (const project of projects) {
          const lastSeen = project.lastSnapshotDate;
          const daysAgo = daysBetween(lastSeen, new Date().toISOString().split('T')[0]);
          const freshness =
            daysAgo === 0
              ? colors.success('today')
              : daysAgo <= 3
                ? colors.warning(`${daysAgo}d ago`)
                : colors.muted(`${daysAgo}d ago`);

          console.log(
            `  ${colors.accent(project.projectId.padEnd(30))} ${freshness}  (${project.snapshotCount} snapshots)`
          );
          console.log(`    ${colors.muted(project.repoPath)}`);
        }
        console.log('');
      }

      return;
    }

    // ── List mode ──────────────────────────────────────────────────────────
    if (options.list !== undefined) {
      const days = typeof options.list === 'string' ? parseInt(options.list, 10) : 7;
      const journal = new WorkJournal();
      const recent = journal.getRecentActivity(isNaN(days) ? 7 : days);

      if (recent.length === 0) {
        console.log('');
        console.log(UI.warning('No journal entries found'));
        console.log(UI.info('Take your first snapshot with: devdaily snapshot'));
        console.log('');
        return;
      }

      console.log('');
      console.log(UI.section(`📓 Recent Activity (last ${isNaN(days) ? 7 : days} days)`));
      console.log('');

      // Group by date
      const byDate = new Map<string, typeof recent>();
      for (const snapshot of recent) {
        const existing = byDate.get(snapshot.date);
        if (existing) {
          existing.push(snapshot);
        } else {
          byDate.set(snapshot.date, [snapshot]);
        }
      }

      for (const [date, snapshots] of byDate) {
        const isToday = date === journal.todayString();
        const dateLabel = isToday ? `${date} ${colors.success('(today)')}` : date;
        console.log(`  ${colors.accent('━━━')} ${dateLabel} ${colors.accent('━━━')}`);

        for (const snapshot of snapshots) {
          const commitCount = snapshot.todayCommits.length;
          const branch = snapshot.currentBranch;
          const prCount = snapshot.pullRequests.length;

          let line = `    ${colors.accent(snapshot.projectId)}`;
          line += `  🌿 ${branch}`;
          if (commitCount > 0) {
            line += `  📝 ${commitCount} commit${commitCount !== 1 ? 's' : ''}`;
          }
          if (prCount > 0) {
            line += `  🔄 ${prCount} PR${prCount !== 1 ? 's' : ''}`;
          }
          if (snapshot.diffStats) {
            line += `  ${colors.success(`+${snapshot.diffStats.insertions}`)}/${colors.error(`-${snapshot.diffStats.deletions}`)}`;
          }
          console.log(line);

          // Show top commits
          for (const commit of snapshot.todayCommits.slice(0, 3)) {
            console.log(`      ${colors.muted(commit.shortHash)} ${commit.message.slice(0, 60)}`);
          }
          if (snapshot.todayCommits.length > 3) {
            console.log(
              `      ${colors.muted(`... and ${snapshot.todayCommits.length - 3} more`)}`
            );
          }

          if (snapshot.notes) {
            console.log(
              `      ${colors.warning('📌')} ${snapshot.notes.split('\n')[0].slice(0, 60)}`
            );
          }

          if (snapshot.tags.length > 0) {
            console.log(
              `      ${colors.muted('tags:')} ${snapshot.tags.slice(0, 8).join(', ')}${snapshot.tags.length > 8 ? '...' : ''}`
            );
          }
        }
        console.log('');
      }

      return;
    }

    // ── Prune mode ─────────────────────────────────────────────────────────
    if (options.prune) {
      const maxAgeDays = parseInt(options.prune, 10);
      if (isNaN(maxAgeDays) || maxAgeDays < 1) {
        console.log(UI.error('Invalid prune age. Use a positive number of days.'));
        process.exit(1);
      }

      const journal = new WorkJournal();
      const { removedDates, removedSnapshots } = journal.prune(maxAgeDays);

      if (removedDates.length === 0) {
        console.log(UI.info(`No journal entries older than ${maxAgeDays} days.`));
      } else {
        console.log(
          UI.success(
            `Pruned ${removedSnapshots} snapshot(s) across ${removedDates.length} date(s) older than ${maxAgeDays} days.`
          )
        );
      }
      return;
    }

    // ── Take snapshot ──────────────────────────────────────────────────────
    if (!(await git.isRepository())) {
      console.log(UI.error('Not a git repository'));
      console.log(UI.info('Run this command inside a git repository'));
      process.exit(1);
    }

    const spinner = UI.spinner('Taking snapshot of your work state...');
    spinner.start();

    try {
      const builder = new SnapshotBuilder(undefined, isDebug);
      const isLight = options.light;

      const result = isLight
        ? await (async () => {
            const r = await builder.takeLightSnapshot({
              date: options.date,
              projectId: options.project,
              note: options.note,
              tags: options.tag,
              debug: isDebug,
            });
            const journal = new WorkJournal();
            journal.saveSnapshot(r.snapshot);
            return r;
          })()
        : await builder.takeAndSave({
            date: options.date,
            projectId: options.project,
            skipPRs: options.prs === false,
            skipTickets: options.tickets === false,
            includeBranches: options.branches !== false,
            note: options.note,
            tags: options.tag,
            debug: isDebug,
          });

      spinner.stop();

      const { snapshot, merged, warnings, durationMs } = result;

      // ── Output ─────────────────────────────────────────────────────────
      console.log('');

      const action = merged ? 'Updated' : 'Saved';
      const title = `📸 ${action} snapshot for ${snapshot.projectId}`;

      const summaryLines: string[] = [];
      summaryLines.push(`📅 Date:    ${snapshot.date}`);
      summaryLines.push(`🌿 Branch:  ${snapshot.currentBranch}`);
      summaryLines.push(`📝 Commits: ${snapshot.todayCommits.length} today`);

      if (snapshot.activeBranches.length > 0) {
        summaryLines.push(`🔀 Active branches: ${snapshot.activeBranches.length}`);
      }

      if (snapshot.pullRequests.length > 0) {
        summaryLines.push(
          `🔄 PRs: ${snapshot.pullRequests.map((pr) => `#${pr.number} (${pr.state})`).join(', ')}`
        );
      }

      if (snapshot.diffStats) {
        summaryLines.push(
          `📊 Changes: ${snapshot.diffStats.filesChanged} files, +${snapshot.diffStats.insertions}/-${snapshot.diffStats.deletions}`
        );
      }

      if (snapshot.tags.length > 0) {
        summaryLines.push(`🏷️  Tags: ${snapshot.tags.join(', ')}`);
      }

      if (snapshot.notes) {
        summaryLines.push(`📌 Note: ${snapshot.notes}`);
      }

      console.log(UI.box(summaryLines.join('\n'), title));

      // Show top commits
      if (snapshot.todayCommits.length > 0) {
        console.log('');
        console.log(`  ${colors.accent("Today's commits:")}`);
        for (const commit of snapshot.todayCommits.slice(0, 8)) {
          console.log(`    ${colors.muted(commit.shortHash)} ${commit.message.slice(0, 70)}`);
        }
        if (snapshot.todayCommits.length > 8) {
          console.log(`    ${colors.muted(`... and ${snapshot.todayCommits.length - 8} more`)}`);
        }
      }

      // Show active branches (if any have WIP)
      const wipBranches = snapshot.activeBranches.filter(
        (b) => b.hasUncommittedChanges || b.aheadOfBase > 0
      );
      if (wipBranches.length > 0) {
        console.log('');
        console.log(`  ${colors.accent('Active work:')}`);
        for (const branch of wipBranches.slice(0, 10)) {
          let status = '';
          if (branch.aheadOfBase > 0) {
            status += colors.warning(`↑${branch.aheadOfBase}`);
          }
          if (branch.hasUncommittedChanges) {
            status += ` ${colors.error('●')} uncommitted`;
          }
          const current = branch.name === snapshot.currentBranch ? ' ←' : '';
          console.log(
            `    ${branch.name}${colors.accent(current)}  ${status}  ${colors.muted(branch.lastCommitMessage.slice(0, 40))}`
          );
        }
      }

      // Warnings
      if (warnings.length > 0) {
        console.log('');
        for (const w of warnings) {
          console.log(UI.warning(w));
        }
      }

      // Stats bar
      const statItems: { label: string; value: string | number }[] = [
        { label: 'time', value: `${durationMs}ms` },
        { label: 'commits', value: snapshot.todayCommits.length },
      ];
      if (snapshot.activeBranches.length > 0) {
        statItems.push({ label: 'branches', value: snapshot.activeBranches.length });
      }
      if (isLight) {
        statItems.push({ label: 'mode', value: 'light' });
      }
      console.log('');
      console.log(UI.stats(statItems));

      console.log('');
      console.log(
        UI.info(
          `Snapshot saved to journal. Use ${colors.accent('devdaily snapshot --list')} to see history.`
        )
      );
      console.log('');
    } catch (error) {
      spinner.stop();
      console.log('');
      console.log(UI.error('Failed to take snapshot'));
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function daysBetween(dateStr: string, todayStr: string): number {
  const d1 = new Date(dateStr);
  const d2 = new Date(todayStr);
  return Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}
