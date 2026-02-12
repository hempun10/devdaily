import { execa } from 'execa';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  milestone?: string;
  url: string;
  createdAt: string;
  closedAt?: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  labels: string[];
  url: string;
  baseBranch: string;
  headBranch: string;
}

/**
 * GitHub integration using the gh CLI
 * Fetches issues, PRs, and project context
 */
export class GitHubClient {
  /**
   * Check if we're in a GitHub repository
   */
  async isGitHubRepo(): Promise<boolean> {
    try {
      await execa('gh', ['repo', 'view', '--json', 'name,owner']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository info
   */
  async getRepoInfo(): Promise<{ owner: string; name: string; url: string } | null> {
    try {
      const { stdout } = await execa('gh', ['repo', 'view', '--json', 'name,owner,url']);
      const data = JSON.parse(stdout);
      return {
        owner: data.owner.login,
        name: data.name,
        url: data.url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch issue details by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    try {
      const { stdout } = await execa('gh', [
        'issue',
        'view',
        String(issueNumber),
        '--json',
        'number,title,body,state,labels,assignees,milestone,url,createdAt,closedAt',
      ]);

      const data = JSON.parse(stdout);

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state.toLowerCase(),
        labels: data.labels?.map((l: { name: string }) => l.name) || [],
        assignees: data.assignees?.map((a: { login: string }) => a.login) || [],
        milestone: data.milestone?.title,
        url: data.url,
        createdAt: data.createdAt,
        closedAt: data.closedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch multiple issues by numbers
   */
  async getIssues(issueNumbers: number[]): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];

    // Fetch in parallel but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < issueNumbers.length; i += batchSize) {
      const batch = issueNumbers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((n) => this.getIssue(n)));
      issues.push(...results.filter((r): r is GitHubIssue => r !== null));
    }

    return issues;
  }

  /**
   * Get recent issues assigned to the current user
   */
  async getMyRecentIssues(limit: number = 10): Promise<GitHubIssue[]> {
    try {
      const { stdout } = await execa('gh', [
        'issue',
        'list',
        '--assignee',
        '@me',
        '--limit',
        String(limit),
        '--json',
        'number,title,body,state,labels,url,createdAt',
      ]);

      const data = JSON.parse(stdout);

      return data.map((issue: Record<string, unknown>) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: (issue.state as string).toLowerCase(),
        labels: ((issue.labels as Array<{ name: string }>) || []).map((l) => l.name),
        assignees: [],
        url: issue.url,
        createdAt: issue.createdAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get issues closed in the last N days
   */
  async getRecentlyClosedIssues(days: number = 7): Promise<GitHubIssue[]> {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const sinceStr = since.toISOString().split('T')[0];

      const { stdout } = await execa('gh', [
        'issue',
        'list',
        '--state',
        'closed',
        '--assignee',
        '@me',
        '--search',
        `closed:>=${sinceStr}`,
        '--json',
        'number,title,body,state,labels,url,createdAt,closedAt',
      ]);

      const data = JSON.parse(stdout);

      return data.map((issue: Record<string, unknown>) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: 'closed',
        labels: ((issue.labels as Array<{ name: string }>) || []).map((l) => l.name),
        assignees: [],
        url: issue.url,
        createdAt: issue.createdAt,
        closedAt: issue.closedAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get PR details by number
   */
  async getPR(prNumber: number): Promise<GitHubPR | null> {
    try {
      const { stdout } = await execa('gh', [
        'pr',
        'view',
        String(prNumber),
        '--json',
        'number,title,body,state,labels,url,baseRefName,headRefName',
      ]);

      const data = JSON.parse(stdout);

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state.toLowerCase(),
        labels: data.labels?.map((l: { name: string }) => l.name) || [],
        url: data.url,
        baseBranch: data.baseRefName,
        headBranch: data.headRefName,
      };
    } catch {
      return null;
    }
  }

  /**
   * Search issues by query
   */
  async searchIssues(query: string, limit: number = 10): Promise<GitHubIssue[]> {
    try {
      const { stdout } = await execa('gh', [
        'issue',
        'list',
        '--search',
        query,
        '--limit',
        String(limit),
        '--json',
        'number,title,body,state,labels,url,createdAt',
      ]);

      const data = JSON.parse(stdout);

      return data.map((issue: Record<string, unknown>) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: (issue.state as string).toLowerCase(),
        labels: ((issue.labels as Array<{ name: string }>) || []).map((l) => l.name),
        assignees: [],
        url: issue.url,
        createdAt: issue.createdAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Format issue for display
   */
  formatIssue(issue: GitHubIssue): string {
    const lines: string[] = [];

    lines.push(`#${issue.number}: ${issue.title}`);

    if (issue.labels.length > 0) {
      lines.push(`Labels: ${issue.labels.join(', ')}`);
    }

    if (issue.body) {
      // Truncate body if too long
      const body = issue.body.length > 500 ? issue.body.slice(0, 500) + '...' : issue.body;
      lines.push('');
      lines.push(body);
    }

    return lines.join('\n');
  }

  /**
   * Format issue summary for AI context
   */
  formatIssueForContext(issue: GitHubIssue): string {
    const parts: string[] = [];

    parts.push(`Issue #${issue.number}: ${issue.title}`);

    if (issue.labels.length > 0) {
      const labelTypes = issue.labels.join(', ');
      parts.push(`Type: ${labelTypes}`);
    }

    if (issue.body) {
      // Extract first paragraph or acceptance criteria
      const body = issue.body;
      const firstParagraph = body.split('\n\n')[0].slice(0, 300);
      parts.push(`Description: ${firstParagraph}`);

      // Look for acceptance criteria
      const acMatch = body.match(/acceptance criteria[:\s]*\n([\s\S]*?)(?=\n#|$)/i);
      if (acMatch) {
        parts.push(`Acceptance Criteria: ${acMatch[1].trim().slice(0, 200)}`);
      }
    }

    return parts.join('\n');
  }
}

// Export singleton
export const github = new GitHubClient();
