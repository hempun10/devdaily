/**
 * Context Analyzer - Extract rich context from git activity
 *
 * Features:
 * - Branch → Ticket correlation (JIRA-123, #123, LINEAR-123)
 * - Work categorization (frontend, backend, infra, docs)
 * - Commit message analysis
 * - Time-based work session tracking
 */

import { GitAnalyzer } from './git-analyzer.js';
import { Commit } from '../types/index.js';

// Ticket patterns for different PM tools
const TICKET_PATTERNS = {
  jira: /([A-Z]{2,10}-\d+)/gi,
  linear: /([A-Z]{2,5}-\d+)/gi,
  github: /#(\d+)/g,
  notion: /([a-f0-9]{32})/gi,
};

// File patterns for work categorization
const WORK_CATEGORIES = {
  frontend: [
    /\.tsx?$/,
    /\.jsx?$/,
    /\.vue$/,
    /\.svelte$/,
    /\.css$/,
    /\.scss$/,
    /\.less$/,
    /components\//,
    /pages\//,
    /views\//,
    /ui\//,
    /styles\//,
  ],
  backend: [
    /\.go$/,
    /\.py$/,
    /\.rb$/,
    /\.java$/,
    /\.rs$/,
    /\.php$/,
    /api\//,
    /server\//,
    /services\//,
    /handlers\//,
    /controllers\//,
    /routes\//,
  ],
  infrastructure: [
    /Dockerfile/,
    /docker-compose/,
    /\.ya?ml$/,
    /\.tf$/,
    /\.hcl$/,
    /k8s\//,
    /kubernetes\//,
    /\.github\/workflows\//,
    /\.circleci\//,
    /infra\//,
    /deploy\//,
  ],
  database: [/\.sql$/, /migrations\//, /prisma\//, /schema\./, /models\//, /entities\//],
  tests: [/\.test\./, /\.spec\./, /__tests__\//, /tests?\//, /cypress\//, /e2e\//],
  docs: [/\.md$/, /\.mdx$/, /docs?\//, /README/, /CHANGELOG/, /CONTRIBUTING/],
  config: [
    /\.json$/,
    /\.ya?ml$/,
    /\.toml$/,
    /\.env/,
    /config\//,
    /\.config\./,
    /tsconfig/,
    /package\.json/,
  ],
};

export interface TicketInfo {
  id: string;
  type: 'jira' | 'linear' | 'github' | 'notion' | 'unknown';
  url?: string;
}

export interface WorkCategory {
  name: string;
  files: string[];
  percentage: number;
}

export interface WorkContext {
  branch: string;
  tickets: TicketInfo[];
  categories: WorkCategory[];
  commitCount: number;
  filesChanged: string[];
  authors: string[];
  timeRange: {
    start: Date;
    end: Date;
    durationHours: number;
  };
  summary: {
    primaryCategory: string;
    ticketSummary: string;
    workDescription: string;
  };
}

export class ContextAnalyzer {
  private git: GitAnalyzer;
  private ticketPrefix?: string;
  private pmTool: 'github' | 'jira' | 'linear' | 'notion' | 'none';

  constructor(
    repoPath?: string,
    pmTool: 'github' | 'jira' | 'linear' | 'notion' | 'none' = 'github',
    ticketPrefix?: string
  ) {
    this.git = new GitAnalyzer(repoPath);
    this.pmTool = pmTool;
    this.ticketPrefix = ticketPrefix;
  }

  /**
   * Extract ticket IDs from branch name
   */
  extractTicketsFromBranch(branchName: string): TicketInfo[] {
    const tickets: TicketInfo[] = [];

    // Try PM-specific pattern first
    if (this.ticketPrefix) {
      const prefixPattern = new RegExp(`(${this.ticketPrefix}-\\d+)`, 'gi');
      const matches = branchName.match(prefixPattern);
      if (matches) {
        for (const match of matches) {
          tickets.push({
            id: match.toUpperCase(),
            type: this.pmTool === 'none' ? 'unknown' : this.pmTool,
          });
        }
      }
    }

    // Try all patterns
    for (const [type, pattern] of Object.entries(TICKET_PATTERNS)) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(branchName)) !== null) {
        const id = type === 'github' ? `#${match[1]}` : match[1].toUpperCase();
        if (!tickets.find((t) => t.id === id)) {
          tickets.push({
            id,
            type: type as TicketInfo['type'],
          });
        }
      }
    }

    return tickets;
  }

  /**
   * Extract ticket IDs from commit messages
   */
  extractTicketsFromCommits(commits: Commit[]): TicketInfo[] {
    const tickets: TicketInfo[] = [];
    const seen = new Set<string>();

    for (const commit of commits) {
      const text = `${commit.message} ${commit.body || ''}`;

      // Try PM-specific pattern first
      if (this.ticketPrefix) {
        const prefixPattern = new RegExp(`(${this.ticketPrefix}-\\d+)`, 'gi');
        const matches = text.match(prefixPattern);
        if (matches) {
          for (const match of matches) {
            const id = match.toUpperCase();
            if (!seen.has(id)) {
              seen.add(id);
              tickets.push({
                id,
                type: this.pmTool === 'none' ? 'unknown' : this.pmTool,
              });
            }
          }
        }
      }

      // Try all patterns
      for (const [type, pattern] of Object.entries(TICKET_PATTERNS)) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
          const id = type === 'github' ? `#${match[1]}` : match[1].toUpperCase();
          if (!seen.has(id)) {
            seen.add(id);
            tickets.push({
              id,
              type: type as TicketInfo['type'],
            });
          }
        }
      }
    }

    return tickets;
  }

  /**
   * Categorize files by work type
   */
  categorizeFiles(files: string[]): WorkCategory[] {
    const categoryCounts: Record<string, string[]> = {};

    for (const category of Object.keys(WORK_CATEGORIES)) {
      categoryCounts[category] = [];
    }

    for (const file of files) {
      let categorized = false;

      for (const [category, patterns] of Object.entries(WORK_CATEGORIES)) {
        for (const pattern of patterns) {
          if (pattern.test(file)) {
            categoryCounts[category].push(file);
            categorized = true;
            break;
          }
        }
        if (categorized) break;
      }

      if (!categorized) {
        if (!categoryCounts['other']) {
          categoryCounts['other'] = [];
        }
        categoryCounts['other'].push(file);
      }
    }

    const total = files.length || 1;
    const categories: WorkCategory[] = [];

    for (const [name, categoryFiles] of Object.entries(categoryCounts)) {
      if (categoryFiles.length > 0) {
        categories.push({
          name,
          files: categoryFiles,
          percentage: Math.round((categoryFiles.length / total) * 100),
        });
      }
    }

    // Sort by percentage descending
    categories.sort((a, b) => b.percentage - a.percentage);

    return categories;
  }

  /**
   * Get comprehensive work context
   */
  async getWorkContext(
    options: {
      since?: Date;
      until?: Date;
      base?: string;
    } = {}
  ): Promise<WorkContext> {
    const branch = await this.git.getCurrentBranch();
    const commits = await this.git.getCommits({
      since: options.since,
      until: options.until,
    });

    let filesChanged: string[] = [];
    try {
      filesChanged = await this.git.getChangedFiles(options.base || 'main', 'HEAD');
    } catch {
      // May fail if no base branch exists
    }

    // Extract tickets from branch and commits
    const branchTickets = this.extractTicketsFromBranch(branch);
    const commitTickets = this.extractTicketsFromCommits(commits);

    // Deduplicate tickets
    const ticketMap = new Map<string, TicketInfo>();
    for (const ticket of [...branchTickets, ...commitTickets]) {
      ticketMap.set(ticket.id, ticket);
    }
    const tickets = Array.from(ticketMap.values());

    // Categorize files
    const categories = this.categorizeFiles(filesChanged);

    // Get unique authors
    const authors = [...new Set(commits.map((c) => c.author))];

    // Calculate time range
    const dates = commits.map((c) => c.date);
    const start =
      dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
    const end =
      dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Generate summary
    const primaryCategory = categories.length > 0 ? categories[0].name : 'general';
    const ticketSummary =
      tickets.length > 0
        ? `Working on ${tickets.map((t) => t.id).join(', ')}`
        : 'No tickets linked';
    const workDescription = this.generateWorkDescription(categories, commits);

    return {
      branch,
      tickets,
      categories,
      commitCount: commits.length,
      filesChanged,
      authors,
      timeRange: {
        start,
        end,
        durationHours: Math.round(durationHours * 10) / 10,
      },
      summary: {
        primaryCategory,
        ticketSummary,
        workDescription,
      },
    };
  }

  /**
   * Generate human-readable work description
   */
  private generateWorkDescription(categories: WorkCategory[], commits: Commit[]): string {
    const parts: string[] = [];

    // Top 2 categories
    const topCategories = categories.slice(0, 2);
    if (topCategories.length > 0) {
      const categoryNames = topCategories.map((c) => c.name).join(' and ');
      parts.push(`${categoryNames} work`);
    }

    // Commit types
    const commitTypes = this.analyzeCommitTypes(commits);
    if (commitTypes.length > 0) {
      parts.push(`(${commitTypes.join(', ')})`);
    }

    return parts.join(' ') || 'Development work';
  }

  /**
   * Analyze commit message types
   */
  private analyzeCommitTypes(commits: Commit[]): string[] {
    const types: Record<string, number> = {};

    for (const commit of commits) {
      const match = commit.message.match(/^(\w+)[(:]/);
      if (match) {
        const type = match[1].toLowerCase();
        types[type] = (types[type] || 0) + 1;
      }
    }

    // Return top 3 types
    return Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }

  /**
   * Format context for AI prompt
   */
  formatContextForAI(context: WorkContext): string {
    const lines: string[] = [];

    lines.push(`Branch: ${context.branch}`);

    if (context.tickets.length > 0) {
      lines.push(`Tickets: ${context.tickets.map((t) => `${t.id} (${t.type})`).join(', ')}`);
    }

    if (context.categories.length > 0) {
      const categoryStr = context.categories
        .slice(0, 3)
        .map((c) => `${c.name}: ${c.percentage}%`)
        .join(', ');
      lines.push(`Work categories: ${categoryStr}`);
    }

    lines.push(`Commits: ${context.commitCount}`);
    lines.push(`Files changed: ${context.filesChanged.length}`);
    lines.push(`Time span: ${context.timeRange.durationHours} hours`);

    if (context.authors.length > 1) {
      lines.push(`Contributors: ${context.authors.join(', ')}`);
    }

    return lines.join('\n');
  }
}
