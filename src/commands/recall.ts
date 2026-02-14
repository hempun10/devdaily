import { Command } from 'commander';
import { WorkJournal } from '../core/work-journal.js';
import { CopilotClient } from '../core/copilot.js';
import UI from '../ui/renderer.js';
import { copyToClipboard } from '../utils/helpers.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

export const recallCommand = new Command('recall')
  .description('Search your work history — "when did I last work on X?"')
  .argument('[query...]', 'Search query (e.g., "auth", "login page", "PROJ-123")')
  .option('-p, --project <id>', 'Filter by project identifier')
  .option('--from <date>', 'Start date for search range (YYYY-MM-DD)')
  .option('--to <date>', 'End date for search range (YYYY-MM-DD)')
  .option('-d, --days <number>', 'Search last N days (default: 90)', '90')
  .option('-t, --tag <tags...>', 'Filter by tags')
  .option('-f, --file <path>', 'Search for a specific file path')
  .option('-l, --limit <number>', 'Max results to show (default: 10)', '10')
  .option('--ai', 'Generate an AI-powered summary of the search results')
  .option('--no-copy', 'Do not copy to clipboard')
  .option('--json', 'Output results as JSON')
  .option('--debug', 'Show debug output')
  .action(async (queryParts, options) => {
    const config = getConfig();
    const journal = new WorkJournal();
    const isDebug = options.debug || process.env.DEVD_DEBUG === '1';

    const query = queryParts.join(' ').trim();

    // ── Validate input ───────────────────────────────────────────────────
    if (!query && !options.tag && !options.file) {
      console.log('');
      console.log(UI.section('🔍 Recall — Search Your Work History'));
      console.log('');
      console.log('  Search across all your journal snapshots to find when you');
      console.log('  last worked on something, touched a file, or used a branch.');
      console.log('');
      console.log(`  ${colors.accent('Usage:')}`);
      console.log(`    devdaily recall <query>              Search by keyword`);
      console.log(`    devdaily recall "auth feature"       Search for a phrase`);
      console.log(`    devdaily recall PROJ-123             Search for a ticket`);
      console.log(`    devdaily recall --file src/auth.ts   Search for a file`);
      console.log(`    devdaily recall --tag bugfix          Search by tag`);
      console.log(`    devdaily recall login --ai           Get AI summary of results`);
      console.log('');
      console.log(`  ${colors.accent('Options:')}`);
      console.log(`    --from / --to                        Date range (YYYY-MM-DD)`);
      console.log(`    --days <N>                           Search last N days (default: 90)`);
      console.log(`    --project <id>                       Filter by project`);
      console.log(`    --limit <N>                          Max results (default: 10)`);
      console.log('');

      // Show quick stats
      const stats = journal.getStats();
      if (stats.totalSnapshots > 0) {
        console.log(
          `  ${colors.muted('Your journal:')} ${stats.totalSnapshots} snapshots across ${stats.totalProjects} project(s), ${stats.totalDates} day(s)`
        );
        if (stats.oldestEntry && stats.newestEntry) {
          console.log(`  ${colors.muted('Range:')} ${stats.oldestEntry} → ${stats.newestEntry}`);
        }
      } else {
        console.log(
          `  ${colors.muted('Your journal is empty. Run')} ${colors.accent('devdaily snapshot')} ${colors.muted('to start tracking.')}`
        );
      }
      console.log('');
      return;
    }

    // ── File search mode ───────────────────────────────────────────────────
    if (options.file) {
      const fileResults = journal.findFileHistory(
        options.file,
        options.project,
        parseInt(options.days, 10) || 90
      );

      if (fileResults.length === 0) {
        console.log('');
        console.log(UI.warning(`No history found for file: ${options.file}`));
        console.log(UI.info('Try broadening your search with a partial path or more --days'));
        console.log('');
        return;
      }

      console.log('');
      console.log(UI.section(`📄 File History: ${options.file}`));
      console.log('');

      const limit = parseInt(options.limit, 10) || 10;
      const toShow = fileResults.slice(-limit).reverse(); // Most recent first

      for (const entry of toShow) {
        const isToday = entry.date === journal.todayString();
        const dateLabel = isToday ? `${entry.date} ${colors.success('(today)')}` : entry.date;

        console.log(`  ${colors.accent('│')} ${dateLabel}`);
        for (const commit of entry.commits.slice(0, 5)) {
          const files = commit.filesChanged
            ? commit.filesChanged.filter((f) =>
                f.toLowerCase().includes(options.file.toLowerCase())
              )
            : [];
          const fileNote = files.length > 0 ? colors.muted(` [${files.join(', ')}]`) : '';
          console.log(
            `  ${colors.accent('│')}   ${colors.muted(commit.shortHash)} ${commit.message.slice(0, 55)}${fileNote}`
          );
        }
        if (entry.commits.length > 5) {
          console.log(
            `  ${colors.accent('│')}   ${colors.muted(`... +${entry.commits.length - 5} more commits`)}`
          );
        }
      }
      console.log(`  ${colors.accent('╵')}`);

      if (fileResults.length > limit) {
        console.log('');
        console.log(
          colors.muted(`  Showing ${limit} of ${fileResults.length} days. Use --limit to see more.`)
        );
      }

      console.log('');
      return;
    }

    // ── Text / tag search mode ─────────────────────────────────────────────
    const spinner = UI.spinner(`Searching journal for "${query || options.tag?.join(', ')}"...`);
    spinner.start();

    // Determine date range
    let fromDate: string | undefined;
    let toDate: string | undefined;

    if (options.from || options.to) {
      fromDate = options.from;
      toDate = options.to;
    } else {
      const days = parseInt(options.days, 10) || 90;
      const from = new Date();
      from.setDate(from.getDate() - days);
      fromDate = journal.dateToString(from);
      toDate = journal.todayString();
    }

    const limit = parseInt(options.limit, 10) || 10;

    const results = journal.search({
      projectId: options.project,
      from: fromDate,
      to: toDate,
      query: query || undefined,
      tags: options.tag,
      limit,
    });

    spinner.stop();

    // ── JSON output ────────────────────────────────────────────────────────
    if (options.json) {
      const jsonOutput = results.map((r) => ({
        date: r.snapshot.date,
        projectId: r.snapshot.projectId,
        branch: r.snapshot.currentBranch,
        score: r.score,
        matchReasons: r.matchReasons,
        commits: r.snapshot.todayCommits.length,
        prs: r.snapshot.pullRequests.length,
        tags: r.snapshot.tags,
        notes: r.snapshot.notes || null,
      }));
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    // ── No results ─────────────────────────────────────────────────────────
    if (results.length === 0) {
      console.log('');
      const searchTerm = query || (options.tag ? `tags: ${options.tag.join(', ')}` : 'unknown');
      console.log(UI.warning(`No matches found for "${searchTerm}"`));
      console.log('');
      console.log(UI.info('Tips:'));
      console.log(`  • Try a broader search term`);
      console.log(`  • Increase the lookback window with ${colors.accent('--days 180')}`);
      console.log(`  • Search across all projects with no ${colors.accent('--project')} filter`);
      console.log(
        `  • Make sure you've been taking snapshots (${colors.accent('devdaily snapshot')})`
      );
      console.log('');
      return;
    }

    // ── Render results ─────────────────────────────────────────────────────
    console.log('');

    const searchLabel = query
      ? `"${query}"`
      : options.tag
        ? `tags: ${options.tag.join(', ')}`
        : 'all';
    console.log(UI.section(`🔍 Recall — ${results.length} result(s) for ${searchLabel}`));
    console.log('');

    for (let i = 0; i < results.length; i++) {
      const { snapshot, matchReasons, score } = results[i];
      const isToday = snapshot.date === journal.todayString();
      const dateLabel = isToday ? `${snapshot.date} ${colors.success('(today)')}` : snapshot.date;

      // Result header
      const scoreBar = '●'.repeat(Math.min(score, 10)) + '○'.repeat(Math.max(0, 10 - score));
      console.log(
        `  ${colors.accent(`${i + 1}.`)} ${dateLabel}  📂 ${colors.accent(snapshot.projectId)}  🌿 ${snapshot.currentBranch}  ${colors.muted(scoreBar)}`
      );

      // Match reasons
      if (matchReasons.length > 0) {
        const reasonsStr = matchReasons.slice(0, 5).join(', ');
        const more = matchReasons.length > 5 ? ` +${matchReasons.length - 5} more` : '';
        console.log(`     ${colors.muted(`Matched: ${reasonsStr}${more}`)}`);
      }

      // Commits
      if (snapshot.todayCommits.length > 0) {
        const relevantCommits = query
          ? snapshot.todayCommits.filter(
              (c) =>
                c.message.toLowerCase().includes(query.toLowerCase()) ||
                c.filesChanged?.some((f) => f.toLowerCase().includes(query.toLowerCase()))
            )
          : [];

        const commitsToShow =
          relevantCommits.length > 0
            ? relevantCommits.slice(0, 3)
            : snapshot.todayCommits.slice(0, 2);

        for (const commit of commitsToShow) {
          // Highlight matching text in commit message
          const msg = query
            ? highlightMatch(commit.message.slice(0, 60), query)
            : commit.message.slice(0, 60);
          console.log(`     ${colors.muted(commit.shortHash)} ${msg}`);
        }

        const remaining = snapshot.todayCommits.length - commitsToShow.length;
        if (remaining > 0) {
          console.log(`     ${colors.muted(`... +${remaining} more commit(s)`)}`);
        }
      }

      // PRs (if relevant)
      if (snapshot.pullRequests.length > 0) {
        const relevantPRs = query
          ? snapshot.pullRequests.filter((pr) =>
              pr.title.toLowerCase().includes(query.toLowerCase())
            )
          : snapshot.pullRequests;

        if (relevantPRs.length > 0) {
          for (const pr of relevantPRs.slice(0, 2)) {
            const stateIcon =
              pr.state === 'open'
                ? colors.success('○')
                : pr.state === 'merged'
                  ? colors.accent('●')
                  : colors.muted('✕');
            const title = query
              ? highlightMatch(pr.title.slice(0, 50), query)
              : pr.title.slice(0, 50);
            console.log(`     ${stateIcon} PR #${pr.number} ${title}`);
          }
        }
      }

      // Notes
      if (snapshot.notes) {
        const notePreview = snapshot.notes.split('\n')[0].slice(0, 55);
        const highlighted = query ? highlightMatch(notePreview, query) : notePreview;
        console.log(`     ${colors.warning('📌')} ${highlighted}`);
      }

      // Diff stats
      if (snapshot.diffStats && snapshot.diffStats.insertions + snapshot.diffStats.deletions > 0) {
        console.log(
          `     ${colors.muted(`${snapshot.diffStats.filesChanged} files`)} ${colors.success(`+${snapshot.diffStats.insertions}`)}/${colors.error(`-${snapshot.diffStats.deletions}`)}`
        );
      }

      // Tags
      if (snapshot.tags.length > 0) {
        const relevantTags = query
          ? snapshot.tags.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
          : [];

        if (relevantTags.length > 0) {
          console.log(`     ${colors.muted('tags:')} ${relevantTags.join(', ')}`);
        }
      }

      console.log('');
    }

    // ── Search metadata ────────────────────────────────────────────────────
    const stats = journal.getStats();
    console.log(
      colors.muted(
        `  Searched ${stats.totalSnapshots} snapshots across ${stats.totalProjects} project(s) from ${fromDate} to ${toDate}`
      )
    );
    console.log('');

    // ── AI summary of search results ───────────────────────────────────────
    if (options.ai) {
      const copilot = new CopilotClient({ debug: isDebug });

      if (!(await copilot.isInstalled())) {
        console.log(
          UI.warning(
            'GitHub Copilot CLI not found — skipping AI summary. Install with: gh extension install github/gh-copilot'
          )
        );
      } else {
        const genSpinner = UI.spinner('Generating AI summary of search results...');
        genSpinner.start();

        try {
          const snapshotsForAI = results.map((r) => r.snapshot);
          const contextBlock = WorkJournal.formatSnapshotsForAI(snapshotsForAI);

          const prompt = buildRecallSummaryPrompt(query, contextBlock, fromDate!, toDate!);
          const summary = await copilot.generateFromPrompt(prompt);

          genSpinner.stop();

          console.log(UI.box(summary, `🔍 AI Summary: "${query}"`));
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
    } else if (results.length > 0) {
      console.log(
        colors.muted(
          `  Tip: Add ${colors.accent('--ai')} for an AI-powered summary of these results`
        )
      );
      console.log('');
    }
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Highlight matching substring in text using accent color.
 */
function highlightMatch(text: string, query: string): string {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return `${before}${colors.accent(match)}${after}`;
}

/**
 * Build an AI prompt for summarizing recall search results.
 */
function buildRecallSummaryPrompt(
  query: string,
  contextBlock: string,
  fromDate: string,
  toDate: string
): string {
  return `You are a developer assistant helping me recall past work.

I searched my work journal for "${query}" and found the matching entries below (from ${fromDate} to ${toDate}).

Your job is to give me a concise summary that answers: "What did I do related to '${query}'?"

Structure your response as:
1. **Summary** — What the work related to "${query}" was about (2-3 sentences)
2. **Timeline** — When the key activities happened (brief chronological list)
3. **Key details** — Specific branches, PRs, files, or tickets that are most relevant
4. **Current state** — Is this work done, still in progress, or abandoned?

Rules:
- Be concise and factual — only use information from the data
- Reference specific commit hashes, branch names, PR numbers when helpful
- If the query matches across multiple projects, organize by project
- Don't hallucinate or invent details

---
MATCHING JOURNAL ENTRIES:
${contextBlock}
---

Generate the recall summary now:`;
}
