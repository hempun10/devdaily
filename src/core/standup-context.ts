/**
 * Standup Context Builder
 *
 * Assembles rich, factual context from multiple sources for accurate standup generation.
 * Instead of sending loose commit messages to the AI, this builds a structured data block
 * that includes:
 *   - Exact git commits (hash, message, body, files)
 *   - PR metadata (title, body, linked issues, review status)
 *   - Ticket details from PM tools (Jira, Linear, GitHub Issues)
 *   - Diff statistics (files changed, insertions, deletions)
 *   - Branch and ticket correlations
 *
 * The goal: give the AI factual, structured data so it summarizes accurately
 * instead of hallucinating "business-friendly" rewrites.
 */

import { GitAnalyzer } from './git-analyzer.js';
import { GitHubClient } from './github.js';
import {
  getProjectManagementClient,
  extractTicketIds,
  extractTicketFromBranch,
  type Ticket,
  type ProjectManagementClient,
} from './project-management.js';
import { ContextAnalyzer, type WorkContext, type WorkCategory } from './context-analyzer.js';
import { getConfig } from '../config/index.js';
import type { Commit, DiffStats } from '../types/index.js';
import { execa } from 'execa';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PRInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  url: string;
  baseBranch: string;
  headBranch: string;
  linkedTickets: string[];
}

export interface CommitDetail {
  hash: string;
  shortHash: string;
  message: string;
  body?: string;
  author: string;
  date: Date;
  filesChanged?: string[];
}

export interface StandupContext {
  /** Current branch name */
  branch: string;

  /** Exact git commits with full details */
  commits: CommitDetail[];

  /** PRs created/merged in the time window */
  pullRequests: PRInfo[];

  /** Tickets fetched from PM tool with full metadata */
  tickets: Ticket[];

  /** Diff statistics */
  diffStats: DiffStats | null;

  /** Top changed files with change counts */
  topChangedFiles: FileChange[];

  /** Work categories from file analysis */
  categories: WorkCategory[];

  /** All extracted ticket IDs (from branch, commits, PRs) */
  ticketIds: string[];

  /** Time range of the work */
  timeRange: {
    since: Date;
    until: Date;
    durationHours: number;
  };

  /** Repository info */
  repo: {
    name: string | null;
    defaultBranch: string;
  };

  /** Raw work context from context analyzer */
  workContext: WorkContext;
}

export interface FileChange {
  path: string;
  /** Number of times this file appears across commits */
  frequency: number;
}

export interface StandupContextOptions {
  /** Number of days to look back */
  days: number;
  /** Filter by author email */
  author?: string;
  /** Specific ticket IDs to include */
  ticketIds?: string[];
  /** Skip PM tool integration */
  skipTickets?: boolean;
  /** Skip PR fetching */
  skipPRs?: boolean;
  /** Base branch for diff */
  baseBranch?: string;
  /** Enable debug logging for ticket fetching and context assembly */
  debug?: boolean;
}

// ─── Context Builder ──────────────────────────────────────────────────────────

export class StandupContextBuilder {
  private git: GitAnalyzer;
  private github: GitHubClient;
  private pmClient: ProjectManagementClient;
  private contextAnalyzer: ContextAnalyzer;
  private config = getConfig();

  constructor(repoPath?: string) {
    this.git = new GitAnalyzer(repoPath);
    this.github = new GitHubClient();
    this.pmClient = getProjectManagementClient();
    this.contextAnalyzer = new ContextAnalyzer(
      repoPath,
      this.config.projectManagement.tool,
      this.config.projectManagement.ticketPrefix
    );
  }

  /**
   * Build comprehensive standup context from all available sources
   */
  async build(options: StandupContextOptions): Promise<StandupContext> {
    const since = new Date();
    since.setDate(since.getDate() - options.days);
    const until = new Date();

    const baseBranch = options.baseBranch || this.config.git.defaultBranch;

    // Phase 1: Gather data from independent sources in parallel
    const [branch, commits, workContext, diffStats, repoName] = await Promise.all([
      this.git.getCurrentBranch(),
      this.git.getCommits({ since, until, author: options.author }),
      this.contextAnalyzer.getWorkContext({ since, until, base: baseBranch }),
      this.safeDiffStats(baseBranch),
      this.safeRepoName(),
    ]);

    // Phase 2: Enrich commits with file change info
    const commitDetails = await this.enrichCommits(commits);

    // Phase 3: Fetch PRs (depends on nothing, but we do it here for clarity)
    let pullRequests: PRInfo[] = [];
    if (!options.skipPRs) {
      pullRequests = await this.fetchRecentPRs(since, options.author);
    }

    // Phase 4: Extract ALL ticket IDs from every source
    const ticketIds = this.extractAllTicketIds(branch, commits, pullRequests, options.ticketIds);

    // Phase 5: Fetch ticket details from PM tool
    let tickets: Ticket[] = [];
    if (!options.skipTickets && ticketIds.length > 0) {
      tickets = await this.fetchTickets(ticketIds, options.debug);
    }

    // Phase 6: Compute top changed files
    const topChangedFiles = this.computeTopChangedFiles(commitDetails);

    // Compute duration
    const dates = commits.map((c) => c.date.getTime());
    const earliest = dates.length > 0 ? Math.min(...dates) : since.getTime();
    const latest = dates.length > 0 ? Math.max(...dates) : until.getTime();
    const durationHours = Math.round(((latest - earliest) / (1000 * 60 * 60)) * 10) / 10;

    return {
      branch,
      commits: commitDetails,
      pullRequests,
      tickets,
      diffStats,
      topChangedFiles,
      categories: workContext.categories,
      ticketIds,
      timeRange: {
        since,
        until,
        durationHours,
      },
      repo: {
        name: repoName,
        defaultBranch: baseBranch,
      },
      workContext,
    };
  }

  // ─── Data Gathering ───────────────────────────────────────────────────────

  /**
   * Enrich commits with per-commit file changes
   */
  private async enrichCommits(commits: Commit[]): Promise<CommitDetail[]> {
    const details: CommitDetail[] = [];

    for (const commit of commits) {
      const filesChanged = await this.git.getCommitFiles(commit.hash);

      details.push({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        body: commit.body,
        author: commit.author,
        date: commit.date,
        filesChanged: filesChanged.length > 0 ? filesChanged : undefined,
      });
    }

    return details;
  }

  /**
   * Fetch recent PRs created or merged by the user
   */
  private async fetchRecentPRs(since: Date, _author?: string): Promise<PRInfo[]> {
    const prs: PRInfo[] = [];

    try {
      // Check if we're in a GitHub repo
      const isGH = await this.github.isGitHubRepo();
      if (!isGH) return [];

      // Fetch merged PRs by current user in the time window
      const sinceStr = since.toISOString().split('T')[0];

      // Fetch open PRs by current user
      const openPRs = await this.fetchPRsFromGH('open');
      prs.push(...openPRs);

      // Fetch recently merged PRs
      const mergedPRs = await this.fetchMergedPRsFromGH(sinceStr);
      prs.push(...mergedPRs);

      // Deduplicate by PR number
      const seen = new Set<number>();
      const unique: PRInfo[] = [];
      for (const pr of prs) {
        if (!seen.has(pr.number)) {
          seen.add(pr.number);
          unique.push(pr);
        }
      }

      return unique;
    } catch {
      // PR fetching is best-effort - don't fail standup because of it
      return [];
    }
  }

  /**
   * Fetch PRs from GitHub CLI with a specific state
   */
  private async fetchPRsFromGH(state: 'open' | 'closed' | 'merged'): Promise<PRInfo[]> {
    try {
      const args = [
        'pr',
        'list',
        '--author',
        '@me',
        '--state',
        state === 'merged' ? 'closed' : state,
        '--json',
        'number,title,body,state,labels,url,baseRefName,headRefName',
        '--limit',
        '20',
      ];

      const { stdout } = await execa('gh', args);
      const data = JSON.parse(stdout);

      return (data as Array<Record<string, unknown>>).map((pr) => this.parsePR(pr));
    } catch {
      return [];
    }
  }

  /**
   * Fetch merged PRs since a given date
   */
  private async fetchMergedPRsFromGH(sinceDate: string): Promise<PRInfo[]> {
    try {
      const { stdout } = await execa('gh', [
        'pr',
        'list',
        '--author',
        '@me',
        '--state',
        'merged',
        '--search',
        `merged:>=${sinceDate}`,
        '--json',
        'number,title,body,state,labels,url,baseRefName,headRefName',
        '--limit',
        '20',
      ]);

      const data = JSON.parse(stdout);
      return (data as Array<Record<string, unknown>>).map((pr) => this.parsePR(pr));
    } catch {
      return [];
    }
  }

  /**
   * Parse a raw GitHub PR JSON object into PRInfo
   */
  private parsePR(raw: Record<string, unknown>): PRInfo {
    const body = (raw.body as string) || '';
    const title = (raw.title as string) || '';

    // Extract ticket IDs from PR title and body
    const linkedTickets = extractTicketIds(`${title} ${body}`);

    return {
      number: raw.number as number,
      title,
      body: body.slice(0, 1000), // Cap body length
      state: ((raw.state as string) || '').toLowerCase(),
      labels: ((raw.labels as Array<{ name: string }>) || []).map((l) => l.name),
      url: (raw.url as string) || '',
      baseBranch: (raw.baseRefName as string) || '',
      headBranch: (raw.headRefName as string) || '',
      linkedTickets,
    };
  }

  /**
   * Extract ticket IDs from all sources
   */
  private extractAllTicketIds(
    branch: string,
    commits: Commit[],
    prs: PRInfo[],
    userTickets?: string[]
  ): string[] {
    const ids = new Set<string>();

    // From user-provided tickets
    if (userTickets) {
      for (const id of userTickets) {
        ids.add(id);
      }
    }

    // From branch name
    const branchTicket = extractTicketFromBranch(branch);
    if (branchTicket) {
      ids.add(branchTicket);
    }

    // From commit messages (including body)
    for (const commit of commits) {
      const text = `${commit.message} ${commit.body || ''}`;
      const commitTickets = extractTicketIds(text);
      for (const id of commitTickets) {
        ids.add(id);
      }
    }

    // From PR titles and bodies
    for (const pr of prs) {
      for (const id of pr.linkedTickets) {
        ids.add(id);
      }
    }

    return Array.from(ids);
  }

  /**
   * Fetch ticket details from PM tool, with graceful error handling
   */
  private async fetchTickets(ticketIds: string[], debug = false): Promise<Ticket[]> {
    try {
      const isConfigured = await this.pmClient.isConfigured();
      if (!isConfigured) {
        if (debug) {
          console.error(`[fetchTickets] PM client (${this.pmClient.tool}) is not configured`);
        }
        return [];
      }

      if (debug) {
        console.error(
          `[fetchTickets] Fetching ${ticketIds.length} tickets via ${this.pmClient.tool}: ${ticketIds.join(', ')}`
        );
      }

      const tickets = await this.pmClient.getTickets(ticketIds);

      if (debug) {
        console.error(`[fetchTickets] Fetched ${tickets.length}/${ticketIds.length} tickets`);
      }

      return tickets;
    } catch (err) {
      // PM tool errors shouldn't break standup generation, but log in debug mode
      if (debug) {
        console.error(`[fetchTickets] Error fetching tickets:`, err);
      }
      return [];
    }
  }

  /**
   * Get diff stats safely (may fail on main branch or shallow clones)
   */
  private async safeDiffStats(baseBranch: string): Promise<DiffStats | null> {
    try {
      return await this.git.getDiffStats(baseBranch, 'HEAD');
    } catch {
      return null;
    }
  }

  /**
   * Get repo name safely
   */
  private async safeRepoName(): Promise<string | null> {
    try {
      const info = await this.github.getRepoInfo();
      return info ? `${info.owner}/${info.name}` : null;
    } catch {
      return null;
    }
  }

  /**
   * Compute most frequently changed files across commits
   */
  private computeTopChangedFiles(commits: CommitDetail[]): FileChange[] {
    const fileCounts = new Map<string, number>();

    for (const commit of commits) {
      if (commit.filesChanged) {
        for (const file of commit.filesChanged) {
          fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
        }
      }
    }

    return Array.from(fileCounts.entries())
      .map(([path, frequency]) => ({ path, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 15); // Top 15 files
  }

  // ─── Context Formatting ─────────────────────────────────────────────────────

  /**
   * Format the full context into a structured text block for the AI prompt.
   * This is the critical piece - it must be factual and structured so the AI
   * doesn't hallucinate or over-generalize.
   */
  static formatForPrompt(ctx: StandupContext): string {
    const sections: string[] = [];

    // ── Header
    sections.push('=== STANDUP CONTEXT (factual data — do NOT invent details) ===');
    sections.push('');

    // ── Repository info
    if (ctx.repo.name) {
      sections.push(`Repository: ${ctx.repo.name}`);
    }
    sections.push(`Branch: ${ctx.branch}`);
    sections.push(
      `Period: ${ctx.timeRange.since.toLocaleDateString()} to ${ctx.timeRange.until.toLocaleDateString()}`
    );
    sections.push('');

    // ── Commits (exact, unmodified)
    sections.push(`--- GIT COMMITS (${ctx.commits.length} total) ---`);
    if (ctx.commits.length === 0) {
      sections.push('(no commits in this period)');
    } else {
      for (const commit of ctx.commits) {
        const dateStr = commit.date.toLocaleString();
        sections.push(`[${commit.shortHash}] ${commit.message}`);
        if (commit.body) {
          // Include commit body but trim to reasonable length
          const body = commit.body.trim().slice(0, 300);
          sections.push(`  Body: ${body}`);
        }
        if (commit.filesChanged && commit.filesChanged.length > 0) {
          const fileList = commit.filesChanged.slice(0, 5).join(', ');
          const more =
            commit.filesChanged.length > 5 ? ` (+${commit.filesChanged.length - 5} more)` : '';
          sections.push(`  Files: ${fileList}${more}`);
        }
        sections.push(`  Author: ${commit.author} | Date: ${dateStr}`);
      }
    }
    sections.push('');

    // ── Pull Requests
    if (ctx.pullRequests.length > 0) {
      sections.push(`--- PULL REQUESTS (${ctx.pullRequests.length}) ---`);
      for (const pr of ctx.pullRequests) {
        const labels = pr.labels.length > 0 ? ` [${pr.labels.join(', ')}]` : '';
        sections.push(`PR #${pr.number}: ${pr.title} (${pr.state})${labels}`);
        sections.push(`  Branch: ${pr.headBranch} → ${pr.baseBranch}`);
        if (pr.body) {
          // Include first ~300 chars of PR body
          const bodyPreview = pr.body.trim().replace(/\n/g, ' ').slice(0, 300);
          sections.push(`  Description: ${bodyPreview}`);
        }
        if (pr.linkedTickets.length > 0) {
          sections.push(`  Linked tickets: ${pr.linkedTickets.join(', ')}`);
        }
        sections.push(`  URL: ${pr.url}`);
      }
      sections.push('');
    }

    // ── Tickets from PM tool
    if (ctx.tickets.length > 0) {
      sections.push(`--- TICKETS/ISSUES (${ctx.tickets.length}) ---`);
      for (const ticket of ctx.tickets) {
        const priority = ticket.priority ? ` | Priority: ${ticket.priority}` : '';
        sections.push(`${ticket.id}: ${ticket.title}`);
        sections.push(`  Type: ${ticket.type} | Status: ${ticket.status}${priority}`);
        if (ticket.description) {
          const raw =
            typeof ticket.description === 'string'
              ? ticket.description
              : String(ticket.description);
          const desc = raw.trim().replace(/\n/g, ' ').slice(0, 200);
          if (desc) {
            sections.push(`  Description: ${desc}`);
          }
        }
        if (ticket.url) {
          sections.push(`  URL: ${ticket.url}`);
        }
      }
      sections.push('');
    } else if (ctx.ticketIds.length > 0) {
      // We have ticket IDs but couldn't fetch details
      sections.push(`--- TICKET REFERENCES (not fetched) ---`);
      sections.push(`Ticket IDs found: ${ctx.ticketIds.join(', ')}`);
      sections.push('');
    }

    // ── Diff Statistics
    if (ctx.diffStats) {
      sections.push('--- DIFF STATISTICS ---');
      sections.push(`Files changed: ${ctx.diffStats.filesChanged}`);
      sections.push(`Lines added: +${ctx.diffStats.insertions}`);
      sections.push(`Lines removed: -${ctx.diffStats.deletions}`);
      sections.push('');
    }

    // ── Top Changed Files
    if (ctx.topChangedFiles.length > 0) {
      sections.push('--- TOP CHANGED FILES ---');
      for (const file of ctx.topChangedFiles.slice(0, 10)) {
        const freq = file.frequency > 1 ? ` (${file.frequency} commits)` : '';
        sections.push(`  ${file.path}${freq}`);
      }
      sections.push('');
    }

    // ── Work Categories
    if (ctx.categories.length > 0) {
      sections.push('--- WORK AREAS ---');
      for (const cat of ctx.categories.slice(0, 5)) {
        sections.push(`  ${cat.name}: ${cat.percentage}% (${cat.files.length} files)`);
      }
      sections.push('');
    }

    sections.push('=== END CONTEXT ===');

    return sections.join('\n');
  }

  /**
   * Format a compact debug view of the context for terminal display
   */
  static formatDebugSummary(ctx: StandupContext): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────┐');
    lines.push('│          STANDUP CONTEXT (debug)             │');
    lines.push('├─────────────────────────────────────────────┤');

    // Basic info
    if (ctx.repo.name) {
      lines.push(`│ Repo:     ${ctx.repo.name}`);
    }
    lines.push(`│ Branch:   ${ctx.branch}`);
    lines.push(
      `│ Period:   ${ctx.timeRange.since.toLocaleDateString()} → ${ctx.timeRange.until.toLocaleDateString()}`
    );
    lines.push(`│ Duration: ${ctx.timeRange.durationHours}h`);
    lines.push('│');

    // Commits
    lines.push(`│ Commits:  ${ctx.commits.length}`);
    for (const c of ctx.commits.slice(0, 10)) {
      lines.push(`│   [${c.shortHash}] ${c.message.slice(0, 60)}`);
    }
    if (ctx.commits.length > 10) {
      lines.push(`│   ... and ${ctx.commits.length - 10} more`);
    }
    lines.push('│');

    // PRs
    lines.push(`│ PRs:      ${ctx.pullRequests.length}`);
    for (const pr of ctx.pullRequests) {
      lines.push(`│   #${pr.number} ${pr.title.slice(0, 55)} (${pr.state})`);
    }
    lines.push('│');

    // Tickets
    lines.push(`│ Tickets:  ${ctx.tickets.length} fetched, ${ctx.ticketIds.length} IDs found`);
    for (const t of ctx.tickets) {
      lines.push(`│   ${t.id}: ${t.title.slice(0, 50)} [${t.status}]`);
    }
    if (ctx.ticketIds.length > ctx.tickets.length) {
      const unfetched = ctx.ticketIds.filter((id) => !ctx.tickets.find((t) => t.id === id));
      if (unfetched.length > 0) {
        lines.push(`│   (unfetched: ${unfetched.join(', ')})`);
      }
    }
    lines.push('│');

    // Diff stats
    if (ctx.diffStats) {
      lines.push(
        `│ Diff:     ${ctx.diffStats.filesChanged} files, +${ctx.diffStats.insertions}/-${ctx.diffStats.deletions}`
      );
    } else {
      lines.push(`│ Diff:     (not available)`);
    }

    // Categories
    if (ctx.categories.length > 0) {
      const cats = ctx.categories
        .slice(0, 3)
        .map((c) => `${c.name}(${c.percentage}%)`)
        .join(', ');
      lines.push(`│ Areas:    ${cats}`);
    }

    // Top files
    if (ctx.topChangedFiles.length > 0) {
      lines.push(`│ Top files:`);
      for (const f of ctx.topChangedFiles.slice(0, 5)) {
        lines.push(`│   ${f.path}`);
      }
    }

    lines.push('└─────────────────────────────────────────────┘');

    return lines.join('\n');
  }

  /**
   * Build the full AI prompt for standup generation using the assembled context.
   * This prompt is designed to produce ACCURATE output, not creative rewrites.
   */
  static buildStandupPrompt(
    ctx: StandupContext,
    tone: 'engineering' | 'mixed' | 'business' = 'mixed'
  ): string {
    const contextBlock = StandupContextBuilder.formatForPrompt(ctx);

    const toneInstructions: Record<string, string> = {
      engineering: `- Use precise technical language (mention file names, modules, APIs where relevant)
- Keep descriptions accurate to the actual commit messages and PR descriptions
- Include ticket IDs inline where applicable
- This is for an engineering audience — be specific about what code changed`,

      mixed: `- Write clearly for both technical and non-technical readers
- Keep descriptions accurate and grounded in the actual commits/PRs
- Mention ticket IDs inline where applicable
- Describe the PURPOSE of changes (from ticket/PR context) alongside WHAT changed
- Do NOT invent impacts or user-facing benefits that aren't evident from the data`,

      business: `- Describe work in terms of features, fixes, and improvements
- Reference ticket IDs where available
- Focus on outcomes and deliverables
- Keep it grounded — only mention impacts that are clearly implied by the ticket/PR descriptions
- Do NOT fabricate user-facing benefits unless the ticket description explicitly mentions them`,
    };

    const prompt = `You are generating a daily standup update from REAL git and project data.

CRITICAL RULES:
1. ONLY describe work that appears in the context data below. Do NOT invent or embellish.
2. Use the EXACT commit messages, PR titles, and ticket titles as your source of truth.
3. If a ticket has a description, use it to understand the PURPOSE, but don't fabricate details.
4. If something is unclear from the data, say what the commit/PR says literally.
5. Do NOT add generic filler like "improving user experience" unless a ticket explicitly says that.
6. Keep it concise — 3-6 bullet points for completed work, not more.

${contextBlock}

Now write a standup update in this format:

**Yesterday/Recently:**
• [Accurate description of what was done — grounded in the commits/PRs/tickets above]
• [Another item — reference ticket IDs like PROJ-123 or #123 where they exist]
• [Continue for significant items only — group related commits together]

**Today/Next:**
• [Based on any open PRs or in-progress tickets, suggest what's next]
• [If no signals, write "Continue current work" or "Review and merge open PRs"]

**Blockers:** None (or describe if evident from the data)

Tone guidelines:
${toneInstructions[tone]}

Additional rules:
- Group related commits into single bullet points (e.g., multiple commits on the same feature = 1 bullet)
- Reference PR numbers as "PR #N" and ticket IDs as-is
- If there are both commits and matching PRs, prefer the PR title as it's usually more descriptive
- Do NOT start bullets with "Worked on" repeatedly — vary the language naturally
- Do NOT add emoji
- Keep the total output under 300 words
`;

    return prompt;
  }

  /**
   * Build prompt for weekly summary using the same structured approach
   */
  static buildWeeklyPrompt(ctx: StandupContext): string {
    const contextBlock = StandupContextBuilder.formatForPrompt(ctx);

    return `You are generating a weekly work summary from REAL git and project data.

CRITICAL RULES:
1. ONLY describe work that appears in the context data below. Do NOT invent or embellish.
2. Use the EXACT commit messages, PR titles, and ticket titles as your source of truth.
3. Group related work into themes/features — don't list every commit individually.

${contextBlock}

Write a weekly summary in this format:

**Key Accomplishments:**
1. [Major accomplishment — reference tickets/PRs]
2. [Second accomplishment]
3. [Third accomplishment]
(3-5 items max)

**Stats:** X commits, Y PRs, Z tickets addressed

**Top Achievement:** [Single sentence highlighting the most impactful work]

Rules:
- Be factual and grounded in the data
- Reference ticket IDs and PR numbers
- Suitable for sharing with a manager or in a team meeting
- Under 200 words total
- No emoji
`;
  }
}
