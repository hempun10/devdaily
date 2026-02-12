import { execa } from 'execa';
import { getConfig, getSecrets } from '../config/index.js';

/**
 * Common interface for tickets/issues across different tools
 */
export interface Ticket {
  id: string; // e.g., "PROJ-123", "ENG-456"
  title: string;
  description: string;
  status: string;
  type: 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  labels: string[];
  url: string;
  source: 'github' | 'jira' | 'linear' | 'notion';
}

/**
 * Default ticket patterns for different tools
 */
const TICKET_PATTERNS: Record<string, RegExp> = {
  // JIRA: PROJ-123, ABC-1
  jira: /\b([A-Z][A-Z0-9]+-\d+)\b/gi,
  // Linear: ENG-123, DEV-1 (same format as Jira)
  linear: /\b([A-Z][A-Z0-9]+-\d+)\b/gi,
  // GitHub: #123, gh-123
  github: /#(\d+)\b/g,
  // Notion: Uses UUIDs, harder to extract - typically linked
  notion: /\b([a-f0-9]{32}|[a-f0-9-]{36})\b/gi,
};

/**
 * Common branch naming patterns that contain ticket IDs
 */
const BRANCH_PATTERNS = [
  // feature/PROJ-123-description
  /^(?:feature|fix|bugfix|hotfix|chore|refactor|docs)\/([A-Z][A-Z0-9]+-\d+)/i,
  // PROJ-123/description or PROJ-123-description
  /^([A-Z][A-Z0-9]+-\d+)[-/]/i,
  // feature/123-description (just number)
  /^(?:feature|fix|bugfix|hotfix|chore|refactor|docs)\/(\d+)[-/]/i,
  // user/PROJ-123-description
  /^[a-z0-9_-]+\/([A-Z][A-Z0-9]+-\d+)/i,
];

/**
 * Extract ticket IDs from text (branch name, commit message, etc.)
 */
export function extractTicketIds(
  text: string,
  options: {
    tool?: 'github' | 'jira' | 'linear' | 'notion';
    prefix?: string;
    customPattern?: string;
  } = {}
): string[] {
  const config = getConfig();
  const tool = options.tool || config.projectManagement.tool;
  const prefix = options.prefix || config.projectManagement.ticketPrefix;
  const customPattern = options.customPattern || config.projectManagement.ticketPattern;

  const tickets = new Set<string>();

  // Use custom pattern if provided
  if (customPattern) {
    try {
      const regex = new RegExp(customPattern, 'gi');
      const matches = text.matchAll(regex);
      for (const match of matches) {
        tickets.add(match[1] || match[0]);
      }
    } catch {
      // Invalid regex, fall through to defaults
    }
  }

  // Use prefix-based pattern if provided
  if (prefix) {
    const prefixPattern = new RegExp(`\\b(${prefix}-\\d+)\\b`, 'gi');
    const matches = text.matchAll(prefixPattern);
    for (const match of matches) {
      tickets.add(match[1].toUpperCase());
    }
  }

  // Use tool-specific pattern
  if (tool && tool !== 'none' && TICKET_PATTERNS[tool]) {
    const pattern = TICKET_PATTERNS[tool];
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const ticketId = tool === 'github' ? `#${match[1]}` : match[1].toUpperCase();
      tickets.add(ticketId);
    }
  }

  return Array.from(tickets);
}

/**
 * Extract ticket ID from a branch name
 */
export function extractTicketFromBranch(branchName: string): string | null {
  const config = getConfig();
  const prefix = config.projectManagement.ticketPrefix;

  // First, try prefix-based extraction if configured
  if (prefix) {
    const prefixPattern = new RegExp(`(${prefix}-\\d+)`, 'i');
    const match = branchName.match(prefixPattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  // Try common branch patterns
  for (const pattern of BRANCH_PATTERNS) {
    const match = branchName.match(pattern);
    if (match) {
      const ticketId = match[1];
      // If it's just a number and we have a prefix, combine them
      if (/^\d+$/.test(ticketId) && prefix) {
        return `${prefix}-${ticketId}`;
      }
      return ticketId.toUpperCase();
    }
  }

  return null;
}

/**
 * Abstract base class for project management integrations
 */
export abstract class ProjectManagementClient {
  abstract readonly tool: 'github' | 'jira' | 'linear' | 'notion';

  abstract isConfigured(): Promise<boolean>;
  abstract getTicket(ticketId: string): Promise<Ticket | null>;
  abstract getTickets(ticketIds: string[]): Promise<Ticket[]>;
  abstract searchTickets(query: string, limit?: number): Promise<Ticket[]>;
  abstract getMyTickets(limit?: number): Promise<Ticket[]>;
  abstract getRecentlyClosedTickets(days?: number): Promise<Ticket[]>;

  /**
   * Format ticket for AI context
   */
  formatTicketForContext(ticket: Ticket): string {
    const lines = [
      `[${ticket.id}] ${ticket.title}`,
      `  Type: ${ticket.type} | Status: ${ticket.status}`,
    ];

    if (ticket.priority) {
      lines[1] += ` | Priority: ${ticket.priority}`;
    }

    if (ticket.description) {
      // Truncate description to first 200 chars
      const desc = ticket.description.slice(0, 200).replace(/\n/g, ' ');
      lines.push(`  ${desc}${ticket.description.length > 200 ? '...' : ''}`);
    }

    return lines.join('\n');
  }
}

/**
 * Jira integration using the Jira CLI or API
 */
export class JiraClient extends ProjectManagementClient {
  readonly tool = 'jira' as const;

  async isConfigured(): Promise<boolean> {
    const baseUrl = this.getBaseUrl();
    const auth = this.getAuth();
    return !!(baseUrl && auth);
  }

  private getBaseUrl(): string {
    const config = getConfig();
    const secrets = getSecrets();
    return (
      secrets.jira?.baseUrl ||
      config.projectManagement.jira.baseUrl ||
      process.env.JIRA_BASE_URL ||
      ''
    );
  }

  private getAuth(): { email: string; token: string } | null {
    const secrets = getSecrets();
    const email = secrets.jira?.email || process.env.JIRA_EMAIL;
    const token = secrets.jira?.apiToken || process.env.JIRA_API_TOKEN;
    if (!email || !token) return null;
    return { email, token };
  }

  async getTicket(ticketId: string): Promise<Ticket | null> {
    const baseUrl = this.getBaseUrl();
    const auth = this.getAuth();

    if (!baseUrl || !auth) return null;

    try {
      const { stdout } = await execa('curl', [
        '-s',
        '-u',
        `${auth.email}:${auth.token}`,
        `${baseUrl}/rest/api/3/issue/${ticketId}`,
      ]);

      const data = JSON.parse(stdout);
      if (data.errorMessages) return null;

      return this.parseJiraIssue(data, baseUrl);
    } catch {
      return null;
    }
  }

  async getTickets(ticketIds: string[]): Promise<Ticket[]> {
    const results = await Promise.all(ticketIds.map((id) => this.getTicket(id)));
    return results.filter((t): t is Ticket => t !== null);
  }

  async searchTickets(query: string, limit = 10): Promise<Ticket[]> {
    const baseUrl = this.getBaseUrl();
    const auth = this.getAuth();
    const config = getConfig();
    const projectKey = config.projectManagement.jira.projectKey;

    if (!baseUrl || !auth) return [];

    try {
      const jql = projectKey
        ? `project = ${projectKey} AND text ~ "${query}" ORDER BY updated DESC`
        : `text ~ "${query}" ORDER BY updated DESC`;

      const { stdout } = await execa('curl', [
        '-s',
        '-u',
        `${auth.email}:${auth.token}`,
        '-G',
        '--data-urlencode',
        `jql=${jql}`,
        '--data-urlencode',
        `maxResults=${limit}`,
        `${baseUrl}/rest/api/3/search`,
      ]);

      const data = JSON.parse(stdout);
      return (data.issues || []).map((issue: unknown) =>
        this.parseJiraIssue(issue as Record<string, unknown>, baseUrl)
      );
    } catch {
      return [];
    }
  }

  async getMyTickets(limit = 10): Promise<Ticket[]> {
    const baseUrl = this.getBaseUrl();
    const auth = this.getAuth();

    if (!baseUrl || !auth) return [];

    try {
      const jql = 'assignee = currentUser() AND status != Done ORDER BY updated DESC';

      const { stdout } = await execa('curl', [
        '-s',
        '-u',
        `${auth.email}:${auth.token}`,
        '-G',
        '--data-urlencode',
        `jql=${jql}`,
        '--data-urlencode',
        `maxResults=${limit}`,
        `${baseUrl}/rest/api/3/search`,
      ]);

      const data = JSON.parse(stdout);
      return (data.issues || []).map((issue: unknown) =>
        this.parseJiraIssue(issue as Record<string, unknown>, baseUrl)
      );
    } catch {
      return [];
    }
  }

  async getRecentlyClosedTickets(days = 7): Promise<Ticket[]> {
    const baseUrl = this.getBaseUrl();
    const auth = this.getAuth();

    if (!baseUrl || !auth) return [];

    try {
      const jql = `assignee = currentUser() AND status = Done AND resolved >= -${days}d ORDER BY resolved DESC`;

      const { stdout } = await execa('curl', [
        '-s',
        '-u',
        `${auth.email}:${auth.token}`,
        '-G',
        '--data-urlencode',
        `jql=${jql}`,
        `${baseUrl}/rest/api/3/search`,
      ]);

      const data = JSON.parse(stdout);
      return (data.issues || []).map((issue: unknown) =>
        this.parseJiraIssue(issue as Record<string, unknown>, baseUrl)
      );
    } catch {
      return [];
    }
  }

  private parseJiraIssue(issue: Record<string, unknown>, baseUrl: string): Ticket {
    const fields = issue.fields as Record<string, unknown>;
    const issueType = fields.issuetype as Record<string, unknown>;
    const priority = fields.priority as Record<string, unknown> | null;
    const assignee = fields.assignee as Record<string, unknown> | null;
    const status = fields.status as Record<string, unknown>;
    const labels = fields.labels as string[];

    return {
      id: issue.key as string,
      title: fields.summary as string,
      description: (fields.description as string) || '',
      status: (status?.name as string) || 'unknown',
      type: this.mapJiraType((issueType?.name as string) || ''),
      priority: priority ? this.mapJiraPriority(priority.name as string) : undefined,
      assignee: assignee ? (assignee.displayName as string) : undefined,
      labels: labels || [],
      url: `${baseUrl}/browse/${issue.key}`,
      source: 'jira',
    };
  }

  private mapJiraType(type: string): 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other' {
    const lower = type.toLowerCase();
    if (lower.includes('bug')) return 'bug';
    if (lower.includes('feature')) return 'feature';
    if (lower.includes('story')) return 'story';
    if (lower.includes('epic')) return 'epic';
    if (lower.includes('task')) return 'task';
    return 'other';
  }

  private mapJiraPriority(priority: string): 'low' | 'medium' | 'high' | 'critical' | undefined {
    const lower = priority.toLowerCase();
    if (lower.includes('critical') || lower.includes('blocker')) return 'critical';
    if (lower.includes('high')) return 'high';
    if (lower.includes('medium') || lower.includes('normal')) return 'medium';
    if (lower.includes('low')) return 'low';
    return undefined;
  }
}

/**
 * Linear integration using the Linear API
 */
export class LinearClient extends ProjectManagementClient {
  readonly tool = 'linear' as const;

  private getApiKey(): string | null {
    const secrets = getSecrets();
    return secrets.linear?.apiKey || process.env.LINEAR_API_KEY || null;
  }

  async isConfigured(): Promise<boolean> {
    return !!this.getApiKey();
  }

  private async graphql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('LINEAR_API_KEY not set');

    const { stdout } = await execa('curl', [
      '-s',
      '-X',
      'POST',
      '-H',
      'Content-Type: application/json',
      '-H',
      `Authorization: ${apiKey}`,
      '-d',
      JSON.stringify({ query, variables }),
      'https://api.linear.app/graphql',
    ]);

    const response = JSON.parse(stdout);
    if (response.errors) {
      throw new Error(response.errors[0]?.message || 'GraphQL error');
    }
    return response.data;
  }

  async getTicket(ticketId: string): Promise<Ticket | null> {
    try {
      const query = `
        query GetIssue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            state { name }
            priority
            assignee { name }
            labels { nodes { name } }
            url
          }
        }
      `;

      // Linear uses identifier (e.g., "ENG-123") for lookup
      const data = (await this.graphql(query, { id: ticketId })) as Record<string, unknown>;
      const issue = data.issue as Record<string, unknown>;
      if (!issue) return null;

      return this.parseLinearIssue(issue);
    } catch {
      return null;
    }
  }

  async getTickets(ticketIds: string[]): Promise<Ticket[]> {
    const results = await Promise.all(ticketIds.map((id) => this.getTicket(id)));
    return results.filter((t): t is Ticket => t !== null);
  }

  async searchTickets(query: string, limit = 10): Promise<Ticket[]> {
    try {
      const graphqlQuery = `
        query SearchIssues($query: String!, $first: Int!) {
          issueSearch(query: $query, first: $first) {
            nodes {
              id
              identifier
              title
              description
              state { name }
              priority
              assignee { name }
              labels { nodes { name } }
              url
            }
          }
        }
      `;

      const data = (await this.graphql(graphqlQuery, { query, first: limit })) as Record<
        string,
        unknown
      >;
      const search = data.issueSearch as Record<string, unknown>;
      const nodes = (search?.nodes as unknown[]) || [];
      return nodes.map((issue) => this.parseLinearIssue(issue as Record<string, unknown>));
    } catch {
      return [];
    }
  }

  async getMyTickets(limit = 10): Promise<Ticket[]> {
    try {
      const query = `
        query MyIssues($first: Int!) {
          viewer {
            assignedIssues(first: $first, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
              nodes {
                id
                identifier
                title
                description
                state { name }
                priority
                assignee { name }
                labels { nodes { name } }
                url
              }
            }
          }
        }
      `;

      const data = (await this.graphql(query, { first: limit })) as Record<string, unknown>;
      const viewer = data.viewer as Record<string, unknown>;
      const assignedIssues = viewer?.assignedIssues as Record<string, unknown>;
      const nodes = (assignedIssues?.nodes as unknown[]) || [];
      return nodes.map((issue) => this.parseLinearIssue(issue as Record<string, unknown>));
    } catch {
      return [];
    }
  }

  async getRecentlyClosedTickets(days = 7): Promise<Ticket[]> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const query = `
        query ClosedIssues($first: Int!, $since: DateTime!) {
          viewer {
            assignedIssues(first: $first, filter: { state: { type: { eq: "completed" } }, completedAt: { gte: $since } }) {
              nodes {
                id
                identifier
                title
                description
                state { name }
                priority
                assignee { name }
                labels { nodes { name } }
                url
              }
            }
          }
        }
      `;

      const data = (await this.graphql(query, {
        first: 50,
        since: since.toISOString(),
      })) as Record<string, unknown>;
      const viewer = data.viewer as Record<string, unknown>;
      const assignedIssues = viewer?.assignedIssues as Record<string, unknown>;
      const nodes = (assignedIssues?.nodes as unknown[]) || [];
      return nodes.map((issue) => this.parseLinearIssue(issue as Record<string, unknown>));
    } catch {
      return [];
    }
  }

  private parseLinearIssue(issue: Record<string, unknown>): Ticket {
    const state = issue.state as Record<string, unknown>;
    const assignee = issue.assignee as Record<string, unknown> | null;
    const labelsObj = issue.labels as Record<string, unknown>;
    const labelNodes = (labelsObj?.nodes as Array<{ name: string }>) || [];

    return {
      id: issue.identifier as string,
      title: issue.title as string,
      description: (issue.description as string) || '',
      status: (state?.name as string) || 'unknown',
      type: this.inferTypeFromLabels(labelNodes.map((l) => l.name)),
      priority: this.mapLinearPriority(issue.priority as number),
      assignee: assignee ? (assignee.name as string) : undefined,
      labels: labelNodes.map((l) => l.name),
      url: issue.url as string,
      source: 'linear',
    };
  }

  private inferTypeFromLabels(
    labels: string[]
  ): 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other' {
    const joined = labels.join(' ').toLowerCase();
    if (joined.includes('bug')) return 'bug';
    if (joined.includes('feature')) return 'feature';
    if (joined.includes('epic')) return 'epic';
    return 'task';
  }

  private mapLinearPriority(priority: number): 'low' | 'medium' | 'high' | 'critical' | undefined {
    // Linear uses 0-4: 0=no priority, 1=urgent, 2=high, 3=medium, 4=low
    switch (priority) {
      case 1:
        return 'critical';
      case 2:
        return 'high';
      case 3:
        return 'medium';
      case 4:
        return 'low';
      default:
        return undefined;
    }
  }
}

/**
 * Notion integration using the Notion API
 */
export class NotionClient extends ProjectManagementClient {
  readonly tool = 'notion' as const;

  private getApiKey(): string | null {
    const secrets = getSecrets();
    return secrets.notion?.apiKey || process.env.NOTION_API_KEY || null;
  }

  private getDatabaseId(): string | null {
    const config = getConfig();
    const secrets = getSecrets();
    return (
      secrets.notion?.databaseId ||
      config.projectManagement.notion.databaseId ||
      process.env.NOTION_DATABASE_ID ||
      null
    );
  }

  async isConfigured(): Promise<boolean> {
    return !!(this.getApiKey() && this.getDatabaseId());
  }

  private async request(
    endpoint: string,
    method = 'GET',
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('NOTION_API_KEY not set');

    const args = [
      '-s',
      '-X',
      method,
      '-H',
      'Content-Type: application/json',
      '-H',
      `Authorization: Bearer ${apiKey}`,
      '-H',
      'Notion-Version: 2022-06-28',
    ];

    if (body) {
      args.push('-d', JSON.stringify(body));
    }

    args.push(`https://api.notion.com/v1${endpoint}`);

    const { stdout } = await execa('curl', args);
    return JSON.parse(stdout);
  }

  async getTicket(ticketId: string): Promise<Ticket | null> {
    try {
      const page = (await this.request(`/pages/${ticketId}`)) as Record<string, unknown>;
      return this.parseNotionPage(page);
    } catch {
      return null;
    }
  }

  async getTickets(ticketIds: string[]): Promise<Ticket[]> {
    const results = await Promise.all(ticketIds.map((id) => this.getTicket(id)));
    return results.filter((t): t is Ticket => t !== null);
  }

  async searchTickets(query: string, limit = 10): Promise<Ticket[]> {
    const databaseId = this.getDatabaseId();
    if (!databaseId) return [];

    try {
      const response = (await this.request(`/databases/${databaseId}/query`, 'POST', {
        filter: {
          property: 'Name',
          title: {
            contains: query,
          },
        },
        page_size: limit,
      })) as Record<string, unknown>;

      const results = (response.results as unknown[]) || [];
      return results.map((page) => this.parseNotionPage(page as Record<string, unknown>));
    } catch {
      return [];
    }
  }

  async getMyTickets(_limit = 10): Promise<Ticket[]> {
    // Notion doesn't have a built-in "assigned to me" concept
    // This would need to be customized based on the database schema
    return [];
  }

  async getRecentlyClosedTickets(_days = 7): Promise<Ticket[]> {
    // Would need to know the status property name
    return [];
  }

  private parseNotionPage(page: Record<string, unknown>): Ticket {
    const properties = page.properties as Record<string, unknown>;

    // Try to extract title - Notion uses different property names
    let title = 'Untitled';
    const nameProperty = properties.Name || properties.Title || properties.title;
    if (nameProperty) {
      const propObj = nameProperty as Record<string, unknown>;
      const titleArray = propObj.title as Array<{ plain_text: string }>;
      if (titleArray?.[0]) {
        title = titleArray[0].plain_text;
      }
    }

    // Try to extract status
    let status = 'unknown';
    const statusProperty = properties.Status || properties.status;
    if (statusProperty) {
      const propObj = statusProperty as Record<string, unknown>;
      const selectObj = propObj.select as Record<string, unknown>;
      if (selectObj) {
        status = selectObj.name as string;
      }
    }

    return {
      id: page.id as string,
      title,
      description: '',
      status,
      type: 'task',
      labels: [],
      url: page.url as string,
      source: 'notion',
    };
  }
}

/**
 * GitHub Issues client (wraps existing GitHubClient)
 */
export class GitHubIssueClient extends ProjectManagementClient {
  readonly tool = 'github' as const;

  async isConfigured(): Promise<boolean> {
    try {
      await execa('gh', ['auth', 'status']);
      return true;
    } catch {
      return false;
    }
  }

  async getTicket(ticketId: string): Promise<Ticket | null> {
    const issueNumber = ticketId.replace('#', '');

    try {
      const { stdout } = await execa('gh', [
        'issue',
        'view',
        issueNumber,
        '--json',
        'number,title,body,state,labels,assignees,url',
      ]);

      const data = JSON.parse(stdout);
      return this.parseGitHubIssue(data);
    } catch {
      return null;
    }
  }

  async getTickets(ticketIds: string[]): Promise<Ticket[]> {
    const results = await Promise.all(ticketIds.map((id) => this.getTicket(id)));
    return results.filter((t): t is Ticket => t !== null);
  }

  async searchTickets(query: string, limit = 10): Promise<Ticket[]> {
    try {
      const { stdout } = await execa('gh', [
        'issue',
        'list',
        '--search',
        query,
        '--limit',
        String(limit),
        '--json',
        'number,title,body,state,labels,assignees,url',
      ]);

      const issues = JSON.parse(stdout);
      return issues.map((issue: unknown) =>
        this.parseGitHubIssue(issue as Record<string, unknown>)
      );
    } catch {
      return [];
    }
  }

  async getMyTickets(limit = 10): Promise<Ticket[]> {
    try {
      const { stdout } = await execa('gh', [
        'issue',
        'list',
        '--assignee',
        '@me',
        '--limit',
        String(limit),
        '--json',
        'number,title,body,state,labels,assignees,url',
      ]);

      const issues = JSON.parse(stdout);
      return issues.map((issue: unknown) =>
        this.parseGitHubIssue(issue as Record<string, unknown>)
      );
    } catch {
      return [];
    }
  }

  async getRecentlyClosedTickets(days = 7): Promise<Ticket[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      const { stdout } = await execa('gh', [
        'issue',
        'list',
        '--state',
        'closed',
        '--assignee',
        '@me',
        '--search',
        `closed:>=${since.toISOString().split('T')[0]}`,
        '--json',
        'number,title,body,state,labels,assignees,url',
      ]);

      const issues = JSON.parse(stdout);
      return issues.map((issue: unknown) =>
        this.parseGitHubIssue(issue as Record<string, unknown>)
      );
    } catch {
      return [];
    }
  }

  private parseGitHubIssue(issue: Record<string, unknown>): Ticket {
    const labels = (issue.labels as Array<{ name: string }>) || [];
    const assignees = (issue.assignees as Array<{ login: string }>) || [];

    return {
      id: `#${issue.number}`,
      title: issue.title as string,
      description: (issue.body as string) || '',
      status: (issue.state as string) === 'OPEN' ? 'open' : 'closed',
      type: this.inferTypeFromLabels(labels.map((l) => l.name)),
      assignee: assignees[0]?.login,
      labels: labels.map((l) => l.name),
      url: issue.url as string,
      source: 'github',
    };
  }

  private inferTypeFromLabels(
    labels: string[]
  ): 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other' {
    const joined = labels.join(' ').toLowerCase();
    if (joined.includes('bug')) return 'bug';
    if (joined.includes('feature') || joined.includes('enhancement')) return 'feature';
    if (joined.includes('epic')) return 'epic';
    return 'task';
  }
}

/**
 * Factory function to get the appropriate project management client
 */
export function getProjectManagementClient(): ProjectManagementClient {
  const config = getConfig();
  const tool = config.projectManagement.tool;

  switch (tool) {
    case 'jira':
      return new JiraClient();
    case 'linear':
      return new LinearClient();
    case 'notion':
      return new NotionClient();
    case 'github':
    default:
      return new GitHubIssueClient();
  }
}
