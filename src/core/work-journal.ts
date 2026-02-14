/**
 * Work Journal - Persistent local activity snapshots
 *
 * Stores daily work snapshots locally so you can recall what you were doing
 * on any date, across any project. This is the "memory" layer that powers
 * context recovery, smart recall, and cross-project weekly summaries.
 *
 * Storage layout:
 *   ~/.config/devdaily/journal/
 *     ├── index.json                    # project registry + metadata
 *     ├── 2024-01-15/
 *     │   ├── my-project.json           # snapshot for that project on that day
 *     │   └── other-project.json
 *     └── 2024-01-16/
 *         └── my-project.json
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JournalCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string; // ISO string for serialization
  filesChanged?: string[];
}

export interface JournalBranchSnapshot {
  name: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  lastCommitDate: string;
  hasUncommittedChanges: boolean;
  aheadOfBase: number;
  /** Files with uncommitted modifications at snapshot time */
  uncommittedFiles: string[];
}

export interface JournalPRSnapshot {
  number: number;
  title: string;
  state: string; // open, merged, closed
  url: string;
  baseBranch: string;
  headBranch: string;
  labels: string[];
}

export interface JournalTicketSnapshot {
  id: string;
  title: string;
  status: string;
  type: string;
  priority?: string;
  url?: string;
}

export interface WorkSnapshot {
  /** ISO date string (YYYY-MM-DD) */
  date: string;

  /** ISO timestamp of when this snapshot was taken */
  takenAt: string;

  /** Project identifier (sanitized repo name or directory name) */
  projectId: string;

  /** Absolute path to the repo root */
  repoPath: string;

  /** Remote URL if available */
  remoteUrl?: string;

  /** Current branch at snapshot time */
  currentBranch: string;

  /** All active (non-merged) local branches with status */
  activeBranches: JournalBranchSnapshot[];

  /** Commits made today (on the snapshot date) */
  todayCommits: JournalCommit[];

  /** Commits made in the last 7 days (for context) */
  recentCommits: JournalCommit[];

  /** Open/recently merged PRs */
  pullRequests: JournalPRSnapshot[];

  /** Active/recently touched tickets */
  tickets: JournalTicketSnapshot[];

  /** Work categories breakdown */
  categories: { name: string; percentage: number }[];

  /** Top changed files (today) */
  topChangedFiles: { path: string; frequency: number }[];

  /** Diff stats for today's work */
  diffStats: { filesChanged: number; insertions: number; deletions: number } | null;

  /** Free-form notes the user can attach */
  notes?: string;

  /** AI-generated "what I was working on" summary (if available) */
  aiSummary?: string;

  /** Tags for search (auto-extracted + user-supplied) */
  tags: string[];
}

export interface ProjectRegistryEntry {
  projectId: string;
  repoPath: string;
  remoteUrl?: string;
  lastSnapshotDate: string;
  snapshotCount: number;
  /** First snapshot date */
  firstSeen: string;
}

export interface JournalIndex {
  version: number;
  projects: ProjectRegistryEntry[];
  lastUpdated: string;
}

export interface JournalSearchResult {
  snapshot: WorkSnapshot;
  /** Why this result matched (which fields) */
  matchReasons: string[];
  /** Relevance score (higher = more relevant) */
  score: number;
}

export interface JournalQueryOptions {
  /** Filter by project ID */
  projectId?: string;
  /** Start date (inclusive, YYYY-MM-DD) */
  from?: string;
  /** End date (inclusive, YYYY-MM-DD) */
  to?: string;
  /** Text search query (searches commits, branches, tags, notes) */
  query?: string;
  /** Filter by tags */
  tags?: string[];
  /** Max results to return */
  limit?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNAL_DIR = join(homedir(), '.config', 'devdaily', 'journal');
const INDEX_PATH = join(JOURNAL_DIR, 'index.json');
const JOURNAL_VERSION = 1;

// ─── Work Journal ─────────────────────────────────────────────────────────────

export class WorkJournal {
  private journalDir: string;
  private indexPath: string;

  constructor(journalDir?: string) {
    this.journalDir = journalDir || JOURNAL_DIR;
    this.indexPath = journalDir ? join(journalDir, 'index.json') : INDEX_PATH;
    this.ensureDirectoryExists();
  }

  // ─── Write Operations ───────────────────────────────────────────────────

  /**
   * Save a work snapshot for a given date and project.
   * If a snapshot already exists for that date+project, it is merged/updated
   * (newer commits appended, metadata refreshed).
   */
  saveSnapshot(snapshot: WorkSnapshot): void {
    const dateDir = join(this.journalDir, snapshot.date);
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }

    const filePath = join(dateDir, `${snapshot.projectId}.json`);

    // If a snapshot already exists, merge it
    let finalSnapshot = snapshot;
    if (existsSync(filePath)) {
      try {
        const existing = JSON.parse(readFileSync(filePath, 'utf-8')) as WorkSnapshot;
        finalSnapshot = this.mergeSnapshots(existing, snapshot);
      } catch {
        // Corrupted file — overwrite
      }
    }

    writeFileSync(filePath, JSON.stringify(finalSnapshot, null, 2), 'utf-8');

    // Update the index
    this.updateIndex(finalSnapshot);
  }

  /**
   * Add a user note to today's snapshot for a project.
   */
  addNote(projectId: string, note: string, date?: string): void {
    const targetDate = date || this.todayString();
    const snapshot = this.getSnapshot(targetDate, projectId);
    if (!snapshot) {
      // Create a minimal snapshot just for the note
      const minimal: WorkSnapshot = {
        date: targetDate,
        takenAt: new Date().toISOString(),
        projectId,
        repoPath: process.cwd(),
        currentBranch: '',
        activeBranches: [],
        todayCommits: [],
        recentCommits: [],
        pullRequests: [],
        tickets: [],
        categories: [],
        topChangedFiles: [],
        diffStats: null,
        notes: note,
        tags: [],
      };
      this.saveSnapshot(minimal);
      return;
    }

    snapshot.notes = snapshot.notes ? `${snapshot.notes}\n\n${note}` : note;
    snapshot.takenAt = new Date().toISOString();
    const filePath = join(this.journalDir, targetDate, `${projectId}.json`);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  /**
   * Add an AI-generated summary to a snapshot.
   */
  setAISummary(projectId: string, summary: string, date?: string): void {
    const targetDate = date || this.todayString();
    const snapshot = this.getSnapshot(targetDate, projectId);
    if (!snapshot) return;

    snapshot.aiSummary = summary;
    snapshot.takenAt = new Date().toISOString();
    const filePath = join(this.journalDir, targetDate, `${projectId}.json`);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  /**
   * Add tags to a snapshot.
   */
  addTags(projectId: string, tags: string[], date?: string): void {
    const targetDate = date || this.todayString();
    const snapshot = this.getSnapshot(targetDate, projectId);
    if (!snapshot) return;

    const allTags = new Set([...snapshot.tags, ...tags]);
    snapshot.tags = Array.from(allTags);
    snapshot.takenAt = new Date().toISOString();
    const filePath = join(this.journalDir, targetDate, `${projectId}.json`);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  // ─── Read Operations ────────────────────────────────────────────────────

  /**
   * Get a specific snapshot by date and project.
   */
  getSnapshot(date: string, projectId: string): WorkSnapshot | null {
    const filePath = join(this.journalDir, date, `${projectId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as WorkSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Get all snapshots for a specific date (across all projects).
   */
  getSnapshotsForDate(date: string): WorkSnapshot[] {
    const dateDir = join(this.journalDir, date);
    if (!existsSync(dateDir)) return [];

    const snapshots: WorkSnapshot[] = [];
    try {
      const files = readdirSync(dateDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = readFileSync(join(dateDir, file), 'utf-8');
          snapshots.push(JSON.parse(content) as WorkSnapshot);
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      return [];
    }

    return snapshots;
  }

  /**
   * Get all snapshots for a project within a date range.
   */
  getSnapshotsForRange(projectId: string | null, from: string, to: string): WorkSnapshot[] {
    const snapshots: WorkSnapshot[] = [];
    const dates = this.getDateDirsInRange(from, to);

    for (const date of dates) {
      if (projectId) {
        const snapshot = this.getSnapshot(date, projectId);
        if (snapshot) snapshots.push(snapshot);
      } else {
        snapshots.push(...this.getSnapshotsForDate(date));
      }
    }

    return snapshots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Get the most recent snapshot for a project (regardless of date).
   */
  getLatestSnapshot(projectId: string): WorkSnapshot | null {
    const index = this.getIndex();
    const project = index.projects.find((p) => p.projectId === projectId);
    if (!project) return null;

    return this.getSnapshot(project.lastSnapshotDate, projectId);
  }

  /**
   * Get all snapshots across all projects for the last N days.
   */
  getRecentActivity(days: number = 7): WorkSnapshot[] {
    const to = this.todayString();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const from = this.dateToString(fromDate);

    return this.getSnapshotsForRange(null, from, to);
  }

  /**
   * Get all known projects from the index.
   */
  getProjects(): ProjectRegistryEntry[] {
    return this.getIndex().projects;
  }

  /**
   * Check if a snapshot exists for today for a given project.
   */
  hasTodaySnapshot(projectId: string): boolean {
    return this.getSnapshot(this.todayString(), projectId) !== null;
  }

  // ─── Search ─────────────────────────────────────────────────────────────

  /**
   * Search snapshots using a text query.
   * Searches across: commit messages, branch names, file paths, tags, notes, AI summaries.
   */
  search(options: JournalQueryOptions): JournalSearchResult[] {
    const { projectId, from, to, query, tags, limit = 20 } = options;

    const startDate = from || this.getEarliestDate();
    const endDate = to || this.todayString();

    if (!startDate) return [];

    const allSnapshots = this.getSnapshotsForRange(projectId || null, startDate, endDate);
    let results: JournalSearchResult[] = [];

    for (const snapshot of allSnapshots) {
      const matchResult = this.matchSnapshot(snapshot, query, tags);
      if (matchResult.score > 0) {
        results.push({
          snapshot,
          matchReasons: matchResult.reasons,
          score: matchResult.score,
        });
      }
    }

    // Sort by score descending, then by date descending
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.snapshot.date).getTime() - new Date(a.snapshot.date).getTime();
    });

    if (limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  /**
   * Find when a specific file was last worked on.
   */
  findFileHistory(
    filePath: string,
    projectId?: string,
    maxDays: number = 90
  ): { date: string; commits: JournalCommit[] }[] {
    const to = this.todayString();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - maxDays);
    const from = this.dateToString(fromDate);

    const allSnapshots = this.getSnapshotsForRange(projectId || null, from, to);
    const results: { date: string; commits: JournalCommit[] }[] = [];

    const normalizedPath = filePath.toLowerCase();

    for (const snapshot of allSnapshots) {
      const matchingCommits = snapshot.todayCommits.filter((c) =>
        c.filesChanged?.some((f) => f.toLowerCase().includes(normalizedPath))
      );

      if (matchingCommits.length > 0) {
        results.push({ date: snapshot.date, commits: matchingCommits });
      }
    }

    return results;
  }

  /**
   * Get a cross-project summary for a date range.
   * Groups activity by project and provides aggregate stats.
   */
  getCrossProjectSummary(
    from: string,
    to: string
  ): {
    projects: {
      projectId: string;
      repoPath: string;
      totalCommits: number;
      activeDays: number;
      branches: string[];
      topFiles: string[];
      categories: { name: string; percentage: number }[];
      diffStats: { filesChanged: number; insertions: number; deletions: number };
    }[];
    totalCommits: number;
    totalActiveDays: number;
    dateRange: { from: string; to: string };
  } {
    const allSnapshots = this.getSnapshotsForRange(null, from, to);

    // Group by project
    const projectMap = new Map<
      string,
      {
        repoPath: string;
        snapshots: WorkSnapshot[];
      }
    >();

    for (const snapshot of allSnapshots) {
      const existing = projectMap.get(snapshot.projectId);
      if (existing) {
        existing.snapshots.push(snapshot);
      } else {
        projectMap.set(snapshot.projectId, {
          repoPath: snapshot.repoPath,
          snapshots: [snapshot],
        });
      }
    }

    const projects = Array.from(projectMap.entries()).map(([projectId, data]) => {
      const allCommits = data.snapshots.flatMap((s) => s.todayCommits);
      const allBranches = new Set(data.snapshots.map((s) => s.currentBranch));
      const allFiles = data.snapshots.flatMap((s) => s.topChangedFiles.map((f) => f.path));
      const fileFreq = new Map<string, number>();
      for (const f of allFiles) {
        fileFreq.set(f, (fileFreq.get(f) || 0) + 1);
      }
      const topFiles = Array.from(fileFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path]) => path);

      // Aggregate categories
      const catMap = new Map<string, number[]>();
      for (const snapshot of data.snapshots) {
        for (const cat of snapshot.categories) {
          const existing = catMap.get(cat.name);
          if (existing) {
            existing.push(cat.percentage);
          } else {
            catMap.set(cat.name, [cat.percentage]);
          }
        }
      }
      const categories = Array.from(catMap.entries())
        .map(([name, percentages]) => ({
          name,
          percentage: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
        }))
        .sort((a, b) => b.percentage - a.percentage);

      // Aggregate diff stats
      const diffStats = {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      };
      for (const snapshot of data.snapshots) {
        if (snapshot.diffStats) {
          diffStats.filesChanged += snapshot.diffStats.filesChanged;
          diffStats.insertions += snapshot.diffStats.insertions;
          diffStats.deletions += snapshot.diffStats.deletions;
        }
      }

      return {
        projectId,
        repoPath: data.repoPath,
        totalCommits: allCommits.length,
        activeDays: data.snapshots.length,
        branches: Array.from(allBranches),
        topFiles,
        categories,
        diffStats,
      };
    });

    const activeDates = new Set(allSnapshots.map((s) => s.date));

    return {
      projects: projects.sort((a, b) => b.totalCommits - a.totalCommits),
      totalCommits: projects.reduce((sum, p) => sum + p.totalCommits, 0),
      totalActiveDays: activeDates.size,
      dateRange: { from, to },
    };
  }

  // ─── Formatting for AI ──────────────────────────────────────────────────

  /**
   * Format snapshots into a context block suitable for AI prompts.
   */
  static formatSnapshotsForAI(snapshots: WorkSnapshot[]): string {
    if (snapshots.length === 0) return '[No journal entries found]';

    const sections: string[] = [];

    // Group by project
    const byProject = new Map<string, WorkSnapshot[]>();
    for (const s of snapshots) {
      const existing = byProject.get(s.projectId);
      if (existing) {
        existing.push(s);
      } else {
        byProject.set(s.projectId, [s]);
      }
    }

    for (const [projectId, projectSnapshots] of byProject) {
      const lines: string[] = [];
      lines.push(`## Project: ${projectId}`);
      lines.push(`Path: ${projectSnapshots[0].repoPath}`);
      lines.push('');

      for (const snapshot of projectSnapshots) {
        lines.push(`### ${snapshot.date}`);
        lines.push(`Branch: ${snapshot.currentBranch}`);

        if (snapshot.todayCommits.length > 0) {
          lines.push(`Commits (${snapshot.todayCommits.length}):`);
          for (const c of snapshot.todayCommits.slice(0, 15)) {
            const files = c.filesChanged
              ? ` [${c.filesChanged.slice(0, 3).join(', ')}${c.filesChanged.length > 3 ? '...' : ''}]`
              : '';
            lines.push(`  - ${c.shortHash} ${c.message}${files}`);
          }
          if (snapshot.todayCommits.length > 15) {
            lines.push(`  ... and ${snapshot.todayCommits.length - 15} more commits`);
          }
        }

        if (snapshot.pullRequests.length > 0) {
          lines.push(`PRs:`);
          for (const pr of snapshot.pullRequests) {
            lines.push(`  - #${pr.number} ${pr.title} (${pr.state})`);
          }
        }

        if (snapshot.tickets.length > 0) {
          lines.push(`Tickets:`);
          for (const t of snapshot.tickets) {
            lines.push(`  - ${t.id}: ${t.title} [${t.status}]`);
          }
        }

        if (snapshot.categories.length > 0) {
          const cats = snapshot.categories
            .slice(0, 3)
            .map((c) => `${c.name}(${c.percentage}%)`)
            .join(', ');
          lines.push(`Work areas: ${cats}`);
        }

        if (snapshot.diffStats) {
          lines.push(
            `Changes: ${snapshot.diffStats.filesChanged} files, +${snapshot.diffStats.insertions}/-${snapshot.diffStats.deletions}`
          );
        }

        if (snapshot.notes) {
          lines.push(`Notes: ${snapshot.notes}`);
        }

        if (snapshot.aiSummary) {
          lines.push(`Summary: ${snapshot.aiSummary}`);
        }

        lines.push('');
      }

      sections.push(lines.join('\n'));
    }

    return sections.join('\n---\n');
  }

  /**
   * Format a single snapshot into a human-readable summary.
   */
  static formatSnapshotSummary(snapshot: WorkSnapshot): string {
    const lines: string[] = [];

    lines.push(`📅 ${snapshot.date} — ${snapshot.projectId}`);
    lines.push(`🌿 Branch: ${snapshot.currentBranch}`);

    if (snapshot.todayCommits.length > 0) {
      lines.push(`📝 ${snapshot.todayCommits.length} commit(s)`);
      for (const c of snapshot.todayCommits.slice(0, 5)) {
        lines.push(`   ${c.shortHash} ${c.message}`);
      }
      if (snapshot.todayCommits.length > 5) {
        lines.push(`   ... and ${snapshot.todayCommits.length - 5} more`);
      }
    }

    if (snapshot.activeBranches.length > 1) {
      const otherBranches = snapshot.activeBranches
        .filter((b) => b.name !== snapshot.currentBranch)
        .slice(0, 5);
      if (otherBranches.length > 0) {
        lines.push(`🔀 Other active branches: ${otherBranches.map((b) => b.name).join(', ')}`);
      }
    }

    if (snapshot.pullRequests.length > 0) {
      lines.push(
        `🔄 PRs: ${snapshot.pullRequests.map((pr) => `#${pr.number} (${pr.state})`).join(', ')}`
      );
    }

    if (snapshot.diffStats) {
      lines.push(
        `📊 +${snapshot.diffStats.insertions}/-${snapshot.diffStats.deletions} across ${snapshot.diffStats.filesChanged} files`
      );
    }

    if (snapshot.notes) {
      lines.push(`📌 Notes: ${snapshot.notes}`);
    }

    if (snapshot.aiSummary) {
      lines.push(`🤖 ${snapshot.aiSummary}`);
    }

    return lines.join('\n');
  }

  // ─── Maintenance ────────────────────────────────────────────────────────

  /**
   * Prune journal entries older than a given number of days.
   */
  prune(maxAgeDays: number = 365): { removedDates: string[]; removedSnapshots: number } {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffStr = this.dateToString(cutoffDate);

    const removedDates: string[] = [];
    let removedSnapshots = 0;

    try {
      const entries = readdirSync(this.journalDir);
      for (const entry of entries) {
        // Only process date directories (YYYY-MM-DD format)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
        if (entry < cutoffStr) {
          const dateDir = join(this.journalDir, entry);
          const stat = statSync(dateDir);
          if (stat.isDirectory()) {
            const files = readdirSync(dateDir).filter((f) => f.endsWith('.json'));
            removedSnapshots += files.length;
            // Remove files then directory
            for (const file of files) {
              const filePath = join(dateDir, file);
              try {
                unlinkSync(filePath);
              } catch {
                // Skip if can't delete
              }
            }
            try {
              rmdirSync(dateDir);
            } catch {
              // Skip if can't delete (not empty)
            }
            removedDates.push(entry);
          }
        }
      }
    } catch {
      // Journal directory doesn't exist yet
    }

    // Rebuild index after pruning
    if (removedDates.length > 0) {
      this.rebuildIndex();
    }

    return { removedDates, removedSnapshots };
  }

  /**
   * Get journal storage stats.
   */
  getStats(): {
    totalSnapshots: number;
    totalDates: number;
    totalProjects: number;
    oldestEntry: string | null;
    newestEntry: string | null;
    storageBytes: number;
  } {
    const index = this.getIndex();
    let totalSnapshots = 0;
    let storageBytes = 0;

    const dates = this.getAllDateDirs();

    for (const date of dates) {
      const dateDir = join(this.journalDir, date);
      try {
        const files = readdirSync(dateDir).filter((f) => f.endsWith('.json'));
        totalSnapshots += files.length;
        for (const file of files) {
          try {
            const stat = statSync(join(dateDir, file));
            storageBytes += stat.size;
          } catch {
            // Skip
          }
        }
      } catch {
        // Skip
      }
    }

    return {
      totalSnapshots,
      totalDates: dates.length,
      totalProjects: index.projects.length,
      oldestEntry: dates.length > 0 ? dates[0] : null,
      newestEntry: dates.length > 0 ? dates[dates.length - 1] : null,
      storageBytes,
    };
  }

  // ─── Auto-tagging ──────────────────────────────────────────────────────

  /**
   * Auto-extract tags from a snapshot's content.
   * Used to make snapshots searchable by topic.
   */
  static autoTag(snapshot: WorkSnapshot): string[] {
    const tags = new Set<string>();

    // Extract from branch name
    const branch = snapshot.currentBranch;
    if (branch.startsWith('feature/')) tags.add('feature');
    if (branch.startsWith('fix/') || branch.startsWith('bugfix/')) tags.add('bugfix');
    if (branch.startsWith('hotfix/')) tags.add('hotfix');
    if (branch.startsWith('chore/')) tags.add('chore');
    if (branch.startsWith('refactor/')) tags.add('refactor');
    if (branch.startsWith('docs/')) tags.add('docs');
    if (branch.startsWith('test/')) tags.add('test');
    if (branch.startsWith('release/')) tags.add('release');

    // Extract from commit types (conventional commits)
    for (const commit of snapshot.todayCommits) {
      const match = commit.message.match(/^(\w+)[(:]/);
      if (match) {
        const type = match[1].toLowerCase();
        if (
          [
            'feat',
            'fix',
            'docs',
            'style',
            'refactor',
            'test',
            'chore',
            'perf',
            'ci',
            'build',
          ].includes(type)
        ) {
          tags.add(type);
        }
      }

      // Extract ticket IDs as tags
      const ticketMatches = commit.message.match(/([A-Z]{2,10}-\d+)/g);
      if (ticketMatches) {
        for (const t of ticketMatches) {
          tags.add(t.toUpperCase());
        }
      }

      const ghIssueMatches = commit.message.match(/#(\d+)/g);
      if (ghIssueMatches) {
        for (const t of ghIssueMatches) {
          tags.add(t);
        }
      }
    }

    // Extract from categories
    for (const cat of snapshot.categories) {
      if (cat.percentage >= 20) {
        tags.add(cat.name);
      }
    }

    // Extract from PR labels
    for (const pr of snapshot.pullRequests) {
      for (const label of pr.labels) {
        tags.add(label.toLowerCase());
      }
    }

    return Array.from(tags);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private ensureDirectoryExists(): void {
    if (!existsSync(this.journalDir)) {
      mkdirSync(this.journalDir, { recursive: true });
    }
  }

  private getIndex(): JournalIndex {
    if (!existsSync(this.indexPath)) {
      return { version: JOURNAL_VERSION, projects: [], lastUpdated: new Date().toISOString() };
    }

    try {
      return JSON.parse(readFileSync(this.indexPath, 'utf-8')) as JournalIndex;
    } catch {
      return { version: JOURNAL_VERSION, projects: [], lastUpdated: new Date().toISOString() };
    }
  }

  private saveIndex(index: JournalIndex): void {
    index.lastUpdated = new Date().toISOString();
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private updateIndex(snapshot: WorkSnapshot): void {
    const index = this.getIndex();
    const existing = index.projects.find((p) => p.projectId === snapshot.projectId);

    if (existing) {
      existing.lastSnapshotDate = snapshot.date;
      existing.repoPath = snapshot.repoPath;
      existing.remoteUrl = snapshot.remoteUrl;
      existing.snapshotCount += 1;
      if (snapshot.date < existing.firstSeen) {
        existing.firstSeen = snapshot.date;
      }
    } else {
      index.projects.push({
        projectId: snapshot.projectId,
        repoPath: snapshot.repoPath,
        remoteUrl: snapshot.remoteUrl,
        lastSnapshotDate: snapshot.date,
        snapshotCount: 1,
        firstSeen: snapshot.date,
      });
    }

    this.saveIndex(index);
  }

  private rebuildIndex(): void {
    const index: JournalIndex = {
      version: JOURNAL_VERSION,
      projects: [],
      lastUpdated: new Date().toISOString(),
    };

    const projectMap = new Map<
      string,
      { repoPath: string; remoteUrl?: string; dates: string[]; count: number }
    >();

    const dates = this.getAllDateDirs();
    for (const date of dates) {
      const dateDir = join(this.journalDir, date);
      try {
        const files = readdirSync(dateDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          try {
            const content = JSON.parse(readFileSync(join(dateDir, file), 'utf-8')) as WorkSnapshot;
            const projectId = content.projectId || basename(file, '.json');
            const existing = projectMap.get(projectId);
            if (existing) {
              existing.dates.push(date);
              existing.count += 1;
            } else {
              projectMap.set(projectId, {
                repoPath: content.repoPath || '',
                remoteUrl: content.remoteUrl,
                dates: [date],
                count: 1,
              });
            }
          } catch {
            // Skip corrupted files
          }
        }
      } catch {
        // Skip
      }
    }

    for (const [projectId, data] of projectMap) {
      data.dates.sort();
      index.projects.push({
        projectId,
        repoPath: data.repoPath,
        remoteUrl: data.remoteUrl,
        lastSnapshotDate: data.dates[data.dates.length - 1],
        snapshotCount: data.count,
        firstSeen: data.dates[0],
      });
    }

    this.saveIndex(index);
  }

  /**
   * Merge two snapshots for the same date+project.
   * The newer snapshot's metadata wins, but commits are deduplicated and merged.
   */
  private mergeSnapshots(existing: WorkSnapshot, incoming: WorkSnapshot): WorkSnapshot {
    // Deduplicate commits by hash
    const commitMap = new Map<string, JournalCommit>();
    for (const c of existing.todayCommits) {
      commitMap.set(c.hash, c);
    }
    for (const c of incoming.todayCommits) {
      commitMap.set(c.hash, c); // Incoming wins on duplicates
    }

    const recentMap = new Map<string, JournalCommit>();
    for (const c of existing.recentCommits) {
      recentMap.set(c.hash, c);
    }
    for (const c of incoming.recentCommits) {
      recentMap.set(c.hash, c);
    }

    // Merge branches
    const branchMap = new Map<string, JournalBranchSnapshot>();
    for (const b of existing.activeBranches) {
      branchMap.set(b.name, b);
    }
    for (const b of incoming.activeBranches) {
      branchMap.set(b.name, b); // Incoming wins
    }

    // Merge PRs
    const prMap = new Map<number, JournalPRSnapshot>();
    for (const pr of existing.pullRequests) {
      prMap.set(pr.number, pr);
    }
    for (const pr of incoming.pullRequests) {
      prMap.set(pr.number, pr);
    }

    // Merge tags
    const allTags = new Set([...existing.tags, ...incoming.tags]);

    return {
      ...incoming,
      takenAt: new Date().toISOString(),
      todayCommits: Array.from(commitMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      recentCommits: Array.from(recentMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      activeBranches: Array.from(branchMap.values()),
      pullRequests: Array.from(prMap.values()),
      notes: existing.notes
        ? incoming.notes
          ? `${existing.notes}\n\n${incoming.notes}`
          : existing.notes
        : incoming.notes,
      aiSummary: incoming.aiSummary || existing.aiSummary,
      tags: Array.from(allTags),
    };
  }

  /**
   * Match a snapshot against search criteria and compute a relevance score.
   */
  private matchSnapshot(
    snapshot: WorkSnapshot,
    query?: string,
    tags?: string[]
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // If no query and no tags, match everything with base score
    if (!query && (!tags || tags.length === 0)) {
      return { score: 1, reasons: ['date match'] };
    }

    // Tag matching
    if (tags && tags.length > 0) {
      const snapshotTags = new Set(snapshot.tags.map((t) => t.toLowerCase()));
      for (const tag of tags) {
        if (snapshotTags.has(tag.toLowerCase())) {
          score += 5;
          reasons.push(`tag: ${tag}`);
        }
      }
    }

    // Text query matching
    if (query) {
      const q = query.toLowerCase();

      // Branch name match (high value — directly relevant)
      if (snapshot.currentBranch.toLowerCase().includes(q)) {
        score += 10;
        reasons.push(`branch: ${snapshot.currentBranch}`);
      }

      // Active branch match
      for (const b of snapshot.activeBranches) {
        if (b.name.toLowerCase().includes(q)) {
          score += 5;
          reasons.push(`active branch: ${b.name}`);
        }
      }

      // Commit message match
      for (const c of snapshot.todayCommits) {
        if (c.message.toLowerCase().includes(q)) {
          score += 3;
          reasons.push(`commit: ${c.shortHash} ${c.message.slice(0, 50)}`);
        }
        // File path match within commits
        if (c.filesChanged) {
          for (const f of c.filesChanged) {
            if (f.toLowerCase().includes(q)) {
              score += 2;
              reasons.push(`file: ${f}`);
            }
          }
        }
      }

      // Recent commit match (lower weight)
      for (const c of snapshot.recentCommits) {
        if (c.message.toLowerCase().includes(q)) {
          score += 1;
          reasons.push(`recent commit: ${c.shortHash} ${c.message.slice(0, 50)}`);
        }
      }

      // PR title match
      for (const pr of snapshot.pullRequests) {
        if (pr.title.toLowerCase().includes(q)) {
          score += 5;
          reasons.push(`PR: #${pr.number} ${pr.title.slice(0, 50)}`);
        }
      }

      // Ticket match
      for (const t of snapshot.tickets) {
        if (t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) {
          score += 5;
          reasons.push(`ticket: ${t.id}`);
        }
      }

      // Notes match
      if (snapshot.notes && snapshot.notes.toLowerCase().includes(q)) {
        score += 4;
        reasons.push('notes');
      }

      // AI summary match
      if (snapshot.aiSummary && snapshot.aiSummary.toLowerCase().includes(q)) {
        score += 3;
        reasons.push('AI summary');
      }

      // Tag match (via text, in case user doesn't use --tags flag)
      for (const tag of snapshot.tags) {
        if (tag.toLowerCase().includes(q)) {
          score += 2;
          reasons.push(`tag: ${tag}`);
        }
      }

      // Top files match
      for (const f of snapshot.topChangedFiles) {
        if (f.path.toLowerCase().includes(q)) {
          score += 2;
          reasons.push(`changed file: ${f.path}`);
        }
      }

      // Project ID match
      if (snapshot.projectId.toLowerCase().includes(q)) {
        score += 3;
        reasons.push(`project: ${snapshot.projectId}`);
      }
    }

    // Deduplicate reasons
    const uniqueReasons = [...new Set(reasons)];

    return { score, reasons: uniqueReasons };
  }

  /**
   * Get all date directories sorted chronologically.
   */
  private getAllDateDirs(): string[] {
    try {
      const entries = readdirSync(this.journalDir);
      return entries
        .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e))
        .filter((e) => {
          try {
            return statSync(join(this.journalDir, e)).isDirectory();
          } catch {
            return false;
          }
        })
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Get date directories within a range (inclusive).
   */
  private getDateDirsInRange(from: string, to: string): string[] {
    return this.getAllDateDirs().filter((d) => d >= from && d <= to);
  }

  /**
   * Get the earliest date directory in the journal.
   */
  private getEarliestDate(): string | null {
    const dirs = this.getAllDateDirs();
    return dirs.length > 0 ? dirs[0] : null;
  }

  /**
   * Get today's date as YYYY-MM-DD string.
   */
  todayString(): string {
    return this.dateToString(new Date());
  }

  /**
   * Convert a Date to YYYY-MM-DD string.
   */
  dateToString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Sanitize a project name for use as a filename.
   */
  static sanitizeProjectId(name: string): string {
    return name
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/^\.+/, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 100);
  }
}
