/**
 * Snapshot Builder - Captures current project state into a WorkSnapshot
 *
 * Uses the existing GitAnalyzer, ContextAnalyzer, StandupContextBuilder,
 * and GitHub client to gather all relevant project state and produce a
 * WorkSnapshot that the WorkJournal can persist.
 *
 * This is the bridge between the real-time analysis layer (git, PRs, tickets)
 * and the persistent memory layer (WorkJournal).
 */

import { GitAnalyzer } from './git-analyzer.js';
import { ContextAnalyzer } from './context-analyzer.js';
import {
  WorkJournal,
  type WorkSnapshot,
  type JournalCommit,
  type JournalBranchSnapshot,
  type JournalPRSnapshot,
  type JournalTicketSnapshot,
} from './work-journal.js';
import { getConfig } from '../config/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotOptions {
  /** Override the date for the snapshot (default: today) */
  date?: string;

  /** Override the project ID (default: auto-detected from repo name / directory) */
  projectId?: string;

  /** Number of days to look back for "recent" commits context (default: 7) */
  recentDays?: number;

  /** Skip fetching PR data */
  skipPRs?: boolean;

  /** Skip fetching ticket data */
  skipTickets?: boolean;

  /** Include active branch listing (default: true) */
  includeBranches?: boolean;

  /** Include uncommitted changes info (default: true) */
  includeUncommitted?: boolean;

  /** Auto-generate AI summary after snapshot (default: false) */
  generateSummary?: boolean;

  /** Debug mode — log extra info */
  debug?: boolean;

  /** Optional note to attach to the snapshot */
  note?: string;

  /** Optional extra tags */
  tags?: string[];
}

export interface SnapshotResult {
  snapshot: WorkSnapshot;
  /** Whether this snapshot was merged with an existing one for the same date */
  merged: boolean;
  /** Warnings encountered during snapshot (non-fatal issues) */
  warnings: string[];
  /** Time taken in milliseconds */
  durationMs: number;
}

// ─── Snapshot Builder ─────────────────────────────────────────────────────────

export class SnapshotBuilder {
  private git: GitAnalyzer;
  private contextAnalyzer: ContextAnalyzer;
  private config = getConfig();
  private debug: boolean;

  constructor(repoPath?: string, debug: boolean = false) {
    this.git = new GitAnalyzer(repoPath);
    this.contextAnalyzer = new ContextAnalyzer(
      repoPath,
      this.config.projectManagement.tool,
      this.config.projectManagement.ticketPrefix
    );
    this.debug = debug;
  }

  /**
   * Take a full snapshot of the current project state.
   *
   * This gathers:
   *  - Current branch and all active local branches
   *  - Today's commits (with file change details)
   *  - Recent commits (last N days, for context)
   *  - Open / recently merged PRs
   *  - Active tickets (extracted from branch names, commits, PRs)
   *  - Work category breakdown (frontend, backend, infra, etc.)
   *  - Diff stats
   *  - Top changed files
   *  - Uncommitted changes
   *
   * The snapshot is ready to be saved by WorkJournal.saveSnapshot().
   */
  async takeSnapshot(options: SnapshotOptions = {}): Promise<SnapshotResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const journal = new WorkJournal();

    const {
      date,
      projectId: overrideProjectId,
      recentDays = 7,
      skipPRs = false,
      skipTickets = false,
      includeBranches = true,
      includeUncommitted = true,
      note,
      tags: extraTags = [],
    } = options;

    const snapshotDate = date || journal.todayString();

    // ── Step 1: Detect project identity ──────────────────────────────────

    const projectId = overrideProjectId || (await this.detectProjectId());
    const repoPath = await this.safeRepoRoot();
    const remoteUrl = await this.safeRemoteUrl();

    this.log('Project ID:', projectId);
    this.log('Repo path:', repoPath);

    // ── Step 2: Get current branch ───────────────────────────────────────

    const currentBranch = await this.safeCurrentBranch();
    this.log('Current branch:', currentBranch);

    // ── Step 3: Get today's commits ──────────────────────────────────────

    const todaySince = this.parseDateStart(snapshotDate);
    const todayUntil = this.parseDateEnd(snapshotDate);

    const todayCommits = await this.getCommitsInRange(todaySince, todayUntil);
    this.log(`Today's commits: ${todayCommits.length}`);

    // ── Step 4: Get recent commits (for context) ─────────────────────────

    const recentSince = new Date();
    recentSince.setDate(recentSince.getDate() - recentDays);
    recentSince.setHours(0, 0, 0, 0);

    const recentCommits = await this.getCommitsInRange(recentSince, todayUntil);
    this.log(`Recent commits (${recentDays}d): ${recentCommits.length}`);

    // ── Step 5: Get active branches ──────────────────────────────────────

    let activeBranches: JournalBranchSnapshot[] = [];
    if (includeBranches) {
      try {
        activeBranches = await this.getActiveBranches(currentBranch, includeUncommitted);
        this.log(`Active branches: ${activeBranches.length}`);
      } catch (err) {
        warnings.push(`Could not list branches: ${(err as Error).message}`);
      }
    }

    // ── Step 6: Get work context (categories, files, diff stats) ─────────

    const baseBranch = this.config.git.defaultBranch || 'main';
    let categories: { name: string; percentage: number }[] = [];
    let diffStats: { filesChanged: number; insertions: number; deletions: number } | null = null;
    let topChangedFiles: { path: string; frequency: number }[] = [];

    try {
      const workContext = await this.contextAnalyzer.getWorkContext({
        since: todaySince,
        until: todayUntil,
        base: baseBranch,
      });

      categories = workContext.categories.map((c) => ({
        name: c.name,
        percentage: c.percentage,
      }));

      topChangedFiles = workContext.filesChanged
        .reduce(
          (acc, file) => {
            const existing = acc.find((f) => f.path === file);
            if (existing) {
              existing.frequency += 1;
            } else {
              acc.push({ path: file, frequency: 1 });
            }
            return acc;
          },
          [] as { path: string; frequency: number }[]
        )
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 20);
    } catch (err) {
      warnings.push(`Could not analyze work context: ${(err as Error).message}`);
    }

    // Try to get diff stats separately (more targeted)
    try {
      const stats = await this.git.getDiffStats(baseBranch, 'HEAD');
      diffStats = stats;
    } catch {
      // Not on a feature branch or base doesn't exist — try commit-based stats
      if (todayCommits.length > 0) {
        const filesChanged = new Set<string>();
        for (const c of todayCommits) {
          if (c.filesChanged) {
            for (const f of c.filesChanged) {
              filesChanged.add(f);
            }
          }
        }
        diffStats = {
          filesChanged: filesChanged.size,
          insertions: 0,
          deletions: 0,
        };
      }
    }

    // ── Step 7: Get PRs ──────────────────────────────────────────────────

    let pullRequests: JournalPRSnapshot[] = [];
    if (!skipPRs) {
      try {
        pullRequests = await this.getRecentPRs(recentSince);
        this.log(`PRs found: ${pullRequests.length}`);
      } catch (err) {
        warnings.push(`Could not fetch PRs: ${(err as Error).message}`);
      }
    }

    // ── Step 8: Get tickets ──────────────────────────────────────────────

    let tickets: JournalTicketSnapshot[] = [];
    if (!skipTickets) {
      try {
        tickets = await this.extractTickets(
          currentBranch,
          todayCommits,
          recentCommits,
          pullRequests
        );
        this.log(`Tickets found: ${tickets.length}`);
      } catch (err) {
        warnings.push(`Could not extract tickets: ${(err as Error).message}`);
      }
    }

    // ── Step 9: Auto-tag ─────────────────────────────────────────────────

    // Build preliminary snapshot for auto-tagging
    const snapshot: WorkSnapshot = {
      date: snapshotDate,
      takenAt: new Date().toISOString(),
      projectId,
      repoPath: repoPath || process.cwd(),
      remoteUrl: remoteUrl || undefined,
      currentBranch,
      activeBranches,
      todayCommits,
      recentCommits,
      pullRequests,
      tickets,
      categories,
      topChangedFiles,
      diffStats,
      notes: note,
      tags: [],
    };

    // Auto-tag + merge with user-supplied tags
    const autoTags = WorkJournal.autoTag(snapshot);
    const allTags = new Set([...autoTags, ...extraTags]);
    snapshot.tags = Array.from(allTags);

    // ── Step 10: Check if this is a merge with existing snapshot ──────────

    const existing = journal.getSnapshot(snapshotDate, projectId);
    const merged = existing !== null;

    // ── Done ─────────────────────────────────────────────────────────────

    const durationMs = Date.now() - startTime;
    this.log(`Snapshot built in ${durationMs}ms (${warnings.length} warnings)`);

    return {
      snapshot,
      merged,
      warnings,
      durationMs,
    };
  }

  /**
   * Take a snapshot and immediately save it to the journal.
   * Returns the saved snapshot and metadata.
   */
  async takeAndSave(options: SnapshotOptions = {}): Promise<SnapshotResult> {
    const result = await this.takeSnapshot(options);
    const journal = new WorkJournal();
    journal.saveSnapshot(result.snapshot);
    return result;
  }

  /**
   * Take a lightweight snapshot — only commits and branch info, no PRs/tickets.
   * Useful for quick saves (e.g., on branch switch via git hook).
   */
  async takeLightSnapshot(options: SnapshotOptions = {}): Promise<SnapshotResult> {
    return this.takeSnapshot({
      ...options,
      skipPRs: true,
      skipTickets: true,
      includeBranches: true,
      includeUncommitted: true,
    });
  }

  // ─── Data Gathering Helpers ─────────────────────────────────────────────

  /**
   * Detect a stable project identifier from the repo.
   * Priority: remote origin name > directory name.
   */
  private async detectProjectId(): Promise<string> {
    // Try to get the repo name from remote origin
    try {
      const remoteUrl = await this.safeRemoteUrl();
      if (remoteUrl) {
        // Extract owner/repo from various URL formats
        // git@github.com:owner/repo.git
        // https://github.com/owner/repo.git
        const sshMatch = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        if (sshMatch) {
          return WorkJournal.sanitizeProjectId(sshMatch[1]);
        }
      }
    } catch {
      // Fall through to directory name
    }

    // Fallback: use the directory name of the repo root
    try {
      const root = await this.git.getRepoRoot();
      const dirName = root.split('/').pop() || root.split('\\').pop() || 'unknown';
      return WorkJournal.sanitizeProjectId(dirName);
    } catch {
      return WorkJournal.sanitizeProjectId(process.cwd().split('/').pop() || 'unknown');
    }
  }

  /**
   * Get commits in a date range, enriched with file change info.
   */
  private async getCommitsInRange(since: Date, until: Date): Promise<JournalCommit[]> {
    try {
      const rawCommits = await this.git.getCommits({ since, until });
      const enriched: JournalCommit[] = [];

      for (const commit of rawCommits) {
        let filesChanged: string[] | undefined;
        try {
          filesChanged = await this.git.getCommitFiles(commit.hash);
        } catch {
          // Non-critical — just skip file info for this commit
        }

        enriched.push({
          hash: commit.hash,
          shortHash: commit.hash.slice(0, 7),
          message: commit.message,
          author: commit.author,
          date: commit.date.toISOString(),
          filesChanged,
        });
      }

      return enriched;
    } catch {
      return [];
    }
  }

  /**
   * Get all active local branches with their status.
   */
  private async getActiveBranches(
    currentBranch: string,
    includeUncommitted: boolean
  ): Promise<JournalBranchSnapshot[]> {
    const branches: JournalBranchSnapshot[] = [];

    try {
      // Get all local branches with last commit info
      const result = await this.git['git'].raw([
        'branch',
        '--format=%(refname:short)|||%(objectname:short)|||%(subject)|||%(committerdate:iso)',
        '--sort=-committerdate',
      ]);

      const lines = result.split('\n').filter(Boolean);
      const baseBranch = this.config.git.defaultBranch || 'main';

      for (const line of lines.slice(0, 30)) {
        // Cap at 30 branches
        const parts = line.split('|||');
        if (parts.length < 4) continue;

        const [name, commitHash, commitMessage, commitDate] = parts;
        const trimmedName = name.trim();

        // Skip the base branch itself in the listing
        if (trimmedName === baseBranch) continue;

        // Compute ahead count (how many commits ahead of base)
        let aheadOfBase = 0;
        try {
          const countResult = await this.git['git'].raw([
            'rev-list',
            '--count',
            `${baseBranch}..${trimmedName}`,
          ]);
          aheadOfBase = parseInt(countResult.trim(), 10) || 0;
        } catch {
          // Base branch might not exist — that's fine
        }

        // Check uncommitted changes only for the current branch
        let hasUncommittedChanges = false;
        let uncommittedFiles: string[] = [];

        if (includeUncommitted && trimmedName === currentBranch) {
          try {
            const status = await this.git.getStatus();
            uncommittedFiles = [...status.modified, ...status.untracked];
            hasUncommittedChanges = uncommittedFiles.length > 0;
          } catch {
            // Non-critical
          }
        }

        branches.push({
          name: trimmedName,
          lastCommitHash: commitHash.trim(),
          lastCommitMessage: commitMessage.trim(),
          lastCommitDate: new Date(commitDate.trim()).toISOString(),
          hasUncommittedChanges,
          aheadOfBase,
          uncommittedFiles,
        });
      }
    } catch {
      // If branch listing fails entirely, at least record the current branch
      branches.push({
        name: currentBranch,
        lastCommitHash: '',
        lastCommitMessage: '',
        lastCommitDate: new Date().toISOString(),
        hasUncommittedChanges: false,
        aheadOfBase: 0,
        uncommittedFiles: [],
      });
    }

    return branches;
  }

  /**
   * Fetch recent PRs and map them to the journal format.
   */
  private async getRecentPRs(since: Date): Promise<JournalPRSnapshot[]> {
    const prs: JournalPRSnapshot[] = [];

    try {
      const { execa } = await import('execa');

      // Fetch open PRs authored by current user
      try {
        const { stdout: openStdout } = await execa(
          'gh',
          [
            'pr',
            'list',
            '--author',
            '@me',
            '--state',
            'open',
            '--json',
            'number,title,state,url,baseRefName,headRefName,labels',
            '--limit',
            '20',
          ],
          { timeout: 15000 }
        );

        const openPRs = JSON.parse(openStdout || '[]');
        for (const pr of openPRs) {
          prs.push(this.mapPR(pr));
        }
      } catch {
        // gh not available or not a GitHub repo
      }

      // Fetch recently merged PRs
      try {
        const { stdout: mergedStdout } = await execa(
          'gh',
          [
            'pr',
            'list',
            '--author',
            '@me',
            '--state',
            'merged',
            '--json',
            'number,title,state,url,baseRefName,headRefName,labels,mergedAt',
            '--limit',
            '10',
          ],
          { timeout: 15000 }
        );

        const mergedPRs = JSON.parse(mergedStdout || '[]');
        for (const pr of mergedPRs) {
          // Only include if merged after `since`
          if (pr.mergedAt && new Date(pr.mergedAt) >= since) {
            prs.push(this.mapPR(pr));
          }
        }
      } catch {
        // Non-critical
      }
    } catch {
      // execa not available — skip PR fetching
    }

    // Deduplicate by PR number
    const seen = new Set<number>();
    return prs.filter((pr) => {
      if (seen.has(pr.number)) return false;
      seen.add(pr.number);
      return true;
    });
  }

  /**
   * Map a raw GH CLI PR object to JournalPRSnapshot.
   */
  private mapPR(pr: Record<string, unknown>): JournalPRSnapshot {
    return {
      number: (pr.number as number) || 0,
      title: (pr.title as string) || '',
      state: (pr.state as string) || 'unknown',
      url: (pr.url as string) || '',
      baseBranch: (pr.baseRefName as string) || '',
      headBranch: (pr.headRefName as string) || '',
      labels: Array.isArray(pr.labels)
        ? (pr.labels as { name: string }[]).map((l) => l.name || '')
        : [],
    };
  }

  /**
   * Extract ticket IDs from various sources and map to journal format.
   */
  private async extractTickets(
    currentBranch: string,
    todayCommits: JournalCommit[],
    recentCommits: JournalCommit[],
    pullRequests: JournalPRSnapshot[]
  ): Promise<JournalTicketSnapshot[]> {
    const ticketIds = new Set<string>();

    // From branch name
    const branchTickets = this.contextAnalyzer.extractTicketsFromBranch(currentBranch);
    for (const t of branchTickets) {
      ticketIds.add(t.id);
    }

    // From commit messages (convert JournalCommit to Commit format)
    const commitLikeObjects = [...todayCommits, ...recentCommits].map((c) => ({
      hash: c.hash,
      message: c.message,
      author: c.author,
      date: new Date(c.date),
      body: undefined,
    }));
    const commitTickets = this.contextAnalyzer.extractTicketsFromCommits(commitLikeObjects);
    for (const t of commitTickets) {
      ticketIds.add(t.id);
    }

    // From PR titles
    for (const pr of pullRequests) {
      const prTickets = this.contextAnalyzer.extractTicketsFromCommits([
        { hash: '', message: pr.title, author: '', date: new Date() },
      ]);
      for (const t of prTickets) {
        ticketIds.add(t.id);
      }
    }

    // Map to JournalTicketSnapshot (basic — no PM API lookup in snapshot builder)
    const tickets: JournalTicketSnapshot[] = [];
    for (const id of ticketIds) {
      tickets.push({
        id,
        title: '', // Would need PM API to get full title
        status: 'unknown',
        type: 'unknown',
      });
    }

    return tickets;
  }

  // ─── Safe Git Helpers (never throw) ─────────────────────────────────────

  private async safeCurrentBranch(): Promise<string> {
    try {
      return await this.git.getCurrentBranch();
    } catch {
      return 'unknown';
    }
  }

  private async safeRepoRoot(): Promise<string | null> {
    try {
      return await this.git.getRepoRoot();
    } catch {
      return null;
    }
  }

  private async safeRemoteUrl(): Promise<string | null> {
    try {
      const result = await this.git['git'].raw(['remote', 'get-url', 'origin']);
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  // ─── Date Helpers ───────────────────────────────────────────────────────

  /**
   * Parse a YYYY-MM-DD string into a Date at 00:00:00 local time.
   */
  private parseDateStart(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return d;
  }

  /**
   * Parse a YYYY-MM-DD string into a Date at 23:59:59 local time.
   */
  private parseDateEnd(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day, 23, 59, 59, 999);
    return d;
  }

  // ─── Debug Logging ──────────────────────────────────────────────────────

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[snapshot]', ...args);
    }
  }
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Quick helper: take a snapshot of the current project and save it.
 * Ideal for use in git hooks or cron jobs.
 */
export async function autoSnapshot(options: SnapshotOptions = {}): Promise<SnapshotResult> {
  const builder = new SnapshotBuilder(undefined, options.debug);
  return builder.takeAndSave(options);
}

/**
 * Quick helper: take a light snapshot (no PRs/tickets) and save it.
 * Ideal for branch-switch hooks where speed matters.
 */
export async function quickSnapshot(options: SnapshotOptions = {}): Promise<SnapshotResult> {
  const builder = new SnapshotBuilder(undefined, options.debug);
  const result = await builder.takeLightSnapshot(options);
  const journal = new WorkJournal();
  journal.saveSnapshot(result.snapshot);
  return result;
}
