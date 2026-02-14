import { execa } from 'execa';
import { getConfig, getSecrets } from '../config/index.js';
import {
  PMAuthError,
  PMConfigError,
  PMConnectionError,
  PMNotFoundError,
  PMRateLimitError,
  PMResponseError,
  type PMConnectionTestResult,
  type PMTool,
  successResult,
  failureResult,
} from './pm-errors.js';

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

// ─── Helpers for fetch-based API calls ────────────────────────────────────────

/**
 * Interpret an HTTP response and throw the appropriate PMError
 * if the status code indicates a problem.
 */
function handleHttpStatus(tool: PMTool, response: Response, resourceId?: string): void {
  if (response.ok) return; // 2xx – nothing to do

  switch (response.status) {
    case 401:
    case 403:
      throw new PMAuthError(tool, `${tool} returned ${response.status}: ${response.statusText}`);
    case 404:
      if (resourceId) {
        throw new PMNotFoundError(tool, resourceId);
      }
      throw new PMConnectionError(tool, `Resource not found (404) on ${tool}`, 404);
    case 429: {
      const retryAfter = response.headers.get('retry-after');
      const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      throw new PMRateLimitError(tool, retryMs);
    }
    default:
      if (response.status >= 500) {
        throw new PMConnectionError(
          tool,
          `${tool} server error: ${response.status} ${response.statusText}`,
          response.status
        );
      }
      throw new PMResponseError(
        tool,
        `${tool} API returned unexpected status ${response.status}: ${response.statusText}`
      );
  }
}

/**
 * Safely parse JSON from a Response, wrapping parse errors in PMResponseError
 */
async function safeParseJson(tool: PMTool, response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new PMResponseError(tool, `Failed to parse ${tool} API response as JSON`, err);
  }
}

// ─── Abstract base class ──────────────────────────────────────────────────────

/**
 * Abstract PM client with common helpers
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
   * Test the connection to the PM tool.
   * Validates credentials, reachability, and authentication in one call.
   */
  abstract testConnection(): Promise<PMConnectionTestResult>;

  /**
   * Get a list of missing configuration fields for this tool.
   * Returns an empty array when fully configured.
   */
  abstract getMissingConfig(): string[];

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

// ─── Jira Client ──────────────────────────────────────────────────────────────

/**
 * Jira integration using native fetch (REST API v3)
 */
export class JiraClient extends ProjectManagementClient {
  readonly tool = 'jira' as const;

  // --- configuration helpers (public for testing) ---

  getBaseUrl(): string {
    const config = getConfig();
    const secrets = getSecrets();
    return (
      secrets.jira?.baseUrl ||
      config.projectManagement.jira.baseUrl ||
      process.env.JIRA_BASE_URL ||
      ''
    );
  }

  getAuth(): { email: string; token: string } | null {
    const secrets = getSecrets();
    const email = secrets.jira?.email || process.env.JIRA_EMAIL;
    const token = secrets.jira?.apiToken || process.env.JIRA_API_TOKEN;
    if (!email || !token) return null;
    return { email, token };
  }

  private authHeader(): string {
    const auth = this.getAuth();
    if (!auth) throw new PMConfigError('jira', this.getMissingConfig());
    return 'Basic ' + Buffer.from(`${auth.email}:${auth.token}`).toString('base64');
  }

  getMissingConfig(): string[] {
    const missing: string[] = [];
    if (!this.getBaseUrl()) missing.push('baseUrl');
    const secrets = getSecrets();
    const email = secrets.jira?.email || process.env.JIRA_EMAIL;
    const token = secrets.jira?.apiToken || process.env.JIRA_API_TOKEN;
    if (!email) missing.push('email');
    if (!token) missing.push('apiToken');
    return missing;
  }

  async isConfigured(): Promise<boolean> {
    return this.getMissingConfig().length === 0;
  }

  // --- fetch helper ---

  private async jiraFetch(
    path: string,
    options: RequestInit = {},
    resourceId?: string
  ): Promise<unknown> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new PMConfigError('jira', ['baseUrl']);

    const url = `${baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.authHeader(),
          ...(options.headers as Record<string, string> | undefined),
        },
      });
    } catch (err) {
      throw new PMConnectionError(
        'jira',
        `Could not reach Jira at ${baseUrl} — check network and base URL`,
        undefined,
        err
      );
    }

    handleHttpStatus('jira', response, resourceId);
    return safeParseJson('jira', response);
  }

  // --- public API ---

  async testConnection(): Promise<PMConnectionTestResult> {
    const missing = this.getMissingConfig();
    if (missing.length > 0) {
      return failureResult('jira', new PMConfigError('jira', missing));
    }

    const start = Date.now();
    try {
      const data = (await this.jiraFetch('/rest/api/3/myself')) as Record<string, unknown>;
      const elapsed = Date.now() - start;
      const displayName = (data.displayName as string) || (data.emailAddress as string) || '';
      return successResult(
        'jira',
        displayName ? `Authenticated as ${displayName}` : undefined,
        elapsed
      );
    } catch (err) {
      if (
        err instanceof PMAuthError ||
        err instanceof PMConnectionError ||
        err instanceof PMConfigError
      ) {
        return failureResult('jira', err);
      }
      return failureResult(
        'jira',
        new PMConnectionError('jira', (err as Error).message, undefined, err)
      );
    }
  }

  async getTicket(ticketId: string): Promise<Ticket | null> {
    if (!(await this.isConfigured())) return null;
    try {
      const data = (await this.jiraFetch(
        `/rest/api/3/issue/${encodeURIComponent(ticketId)}`,
        {},
        ticketId
      )) as Record<string, unknown>;
      if ((data as Record<string, unknown>).errorMessages) return null;
      return this.parseJiraIssue(data, this.getBaseUrl());
    } catch {
      return null;
    }
  }

  async getTickets(ticketIds: string[]): Promise<Ticket[]> {
    const results = await Promise.all(ticketIds.map((id) => this.getTicket(id)));
    return results.filter((t): t is Ticket => t !== null);
  }

  async searchTickets(query: string, limit = 10): Promise<Ticket[]> {
    if (!(await this.isConfigured())) return [];
    const config = getConfig();
    const projectKey = config.projectManagement.jira.projectKey;

    try {
      const jql = projectKey
        ? `project = ${projectKey} AND text ~ "${query}" ORDER BY updated DESC`
        : `text ~ "${query}" ORDER BY updated DESC`;

      const params = new URLSearchParams({ jql, maxResults: String(limit) });
      const data = (await this.jiraFetch(`/rest/api/3/search?${params.toString()}`)) as Record<
        string,
        unknown
      >;
      return ((data.issues as unknown[]) || []).map((issue) =>
        this.parseJiraIssue(issue as Record<string, unknown>, this.getBaseUrl())
      );
    } catch {
      return [];
    }
  }

  async getMyTickets(limit = 10): Promise<Ticket[]> {
    if (!(await this.isConfigured())) return [];
    try {
      const jql = 'assignee = currentUser() AND status != Done ORDER BY updated DESC';
      const params = new URLSearchParams({ jql, maxResults: String(limit) });
      const data = (await this.jiraFetch(`/rest/api/3/search?${params.toString()}`)) as Record<
        string,
        unknown
      >;
      return ((data.issues as unknown[]) || []).map((issue) =>
        this.parseJiraIssue(issue as Record<string, unknown>, this.getBaseUrl())
      );
    } catch {
      return [];
    }
  }

  async getRecentlyClosedTickets(days = 7): Promise<Ticket[]> {
    if (!(await this.isConfigured())) return [];
    try {
      const jql = `assignee = currentUser() AND status = Done AND resolved >= -${days}d ORDER BY resolved DESC`;
      const params = new URLSearchParams({ jql });
      const data = (await this.jiraFetch(`/rest/api/3/search?${params.toString()}`)) as Record<
        string,
        unknown
      >;
      return ((data.issues as unknown[]) || []).map((issue) =>
        this.parseJiraIssue(issue as Record<string, unknown>, this.getBaseUrl())
      );
    } catch {
      return [];
    }
  }

  // --- parsing helpers (public for testing) ---

  parseJiraIssue(issue: Record<string, unknown>, baseUrl: string): Ticket {
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

  mapJiraType(type: string): 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other' {
    const lower = type.toLowerCase();
    if (lower.includes('bug')) return 'bug';
    if (lower.includes('feature')) return 'feature';
    if (lower.includes('story')) return 'story';
    if (lower.includes('epic')) return 'epic';
    if (lower.includes('task')) return 'task';
    return 'other';
  }

  mapJiraPriority(priority: string): 'low' | 'medium' | 'high' | 'critical' | undefined {
    const lower = priority.toLowerCase();
    if (lower.includes('critical') || lower.includes('blocker')) return 'critical';
    if (lower.includes('high')) return 'high';
    if (lower.includes('medium') || lower.includes('normal')) return 'medium';
    if (lower.includes('low')) return 'low';
    return undefined;
  }
}

// ─── Linear Client ────────────────────────────────────────────────────────────

/**
 * Linear integration using native fetch (GraphQL API)
 */
export class LinearClient extends ProjectManagementClient {
  readonly tool = 'linear' as const;

  private static readonly API_URL = 'https://api.linear.app/graphql';

  getApiKey(): string | null {
    const secrets = getSecrets();
    return secrets.linear?.apiKey || process.env.LINEAR_API_KEY || null;
  }

  getMissingConfig(): string[] {
    return this.getApiKey() ? [] : ['apiKey'];
  }

  async isConfigured(): Promise<boolean> {
    return !!this.getApiKey();
  }

  // --- fetch helper ---

  private async graphql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new PMConfigError('linear', ['apiKey']);

    let response: Response;
    try {
      response = await fetch(LinearClient.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new PMConnectionError(
        'linear',
        'Could not reach Linear API — check your network connection',
        undefined,
        err
      );
    }

    handleHttpStatus('linear', response);

    const data = (await safeParseJson('linear', response)) as Record<string, unknown>;
    const errors = data.errors as Array<{ message: string }> | undefined;
    if (errors && errors.length > 0) {
      const msg = errors[0].message;
      if (
        msg.toLowerCase().includes('authentication') ||
        msg.toLowerCase().includes('unauthorized')
      ) {
        throw new PMAuthError('linear', `Linear GraphQL error: ${msg}`);
      }
      throw new PMResponseError('linear', `Linear GraphQL error: ${msg}`);
    }
    return data.data;
  }

  // --- public API ---

  async testConnection(): Promise<PMConnectionTestResult> {
    const missing = this.getMissingConfig();
    if (missing.length > 0) {
      return failureResult('linear', new PMConfigError('linear', missing));
    }

    const start = Date.now();
    try {
      const data = (await this.graphql('query { viewer { id name email } }')) as Record<
        string,
        unknown
      >;
      const elapsed = Date.now() - start;
      const viewer = data.viewer as Record<string, unknown>;
      const name = (viewer?.name as string) || (viewer?.email as string) || '';
      return successResult('linear', name ? `Authenticated as ${name}` : undefined, elapsed);
    } catch (err) {
      if (
        err instanceof PMAuthError ||
        err instanceof PMConnectionError ||
        err instanceof PMConfigError
      ) {
        return failureResult('linear', err);
      }
      return failureResult(
        'linear',
        new PMConnectionError('linear', (err as Error).message, undefined, err)
      );
    }
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

  // --- parsing helpers (public for testing) ---

  parseLinearIssue(issue: Record<string, unknown>): Ticket {
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

  inferTypeFromLabels(labels: string[]): 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other' {
    const joined = labels.join(' ').toLowerCase();
    if (joined.includes('bug')) return 'bug';
    if (joined.includes('feature')) return 'feature';
    if (joined.includes('epic')) return 'epic';
    return 'task';
  }

  mapLinearPriority(priority: number): 'low' | 'medium' | 'high' | 'critical' | undefined {
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

// ─── Notion Client ────────────────────────────────────────────────────────────

/**
 * Notion integration using native fetch (REST API, version 2022-06-28)
 */
export class NotionClient extends ProjectManagementClient {
  readonly tool = 'notion' as const;

  private static readonly API_BASE = 'https://api.notion.com/v1';
  private static readonly API_VERSION = '2022-06-28';

  getApiKey(): string | null {
    const secrets = getSecrets();
    return secrets.notion?.apiKey || process.env.NOTION_API_KEY || null;
  }

  getDatabaseId(): string | null {
    const config = getConfig();
    const secrets = getSecrets();
    return (
      secrets.notion?.databaseId ||
      config.projectManagement.notion.databaseId ||
      process.env.NOTION_DATABASE_ID ||
      null
    );
  }

  getMissingConfig(): string[] {
    const missing: string[] = [];
    if (!this.getApiKey()) missing.push('apiKey');
    if (!this.getDatabaseId()) missing.push('databaseId');
    return missing;
  }

  async isConfigured(): Promise<boolean> {
    return this.getMissingConfig().length === 0;
  }

  // --- fetch helper ---

  private async notionFetch(
    endpoint: string,
    method = 'GET',
    body?: Record<string, unknown>,
    resourceId?: string
  ): Promise<unknown> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new PMConfigError('notion', ['apiKey']);

    const url = `${NotionClient.API_BASE}${endpoint}`;
    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NotionClient.API_VERSION,
      },
    };

    if (body) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      throw new PMConnectionError(
        'notion',
        'Could not reach Notion API — check your network connection',
        undefined,
        err
      );
    }

    handleHttpStatus('notion', response, resourceId);
    return safeParseJson('notion', response);
  }

  // --- public API ---

  async testConnection(): Promise<PMConnectionTestResult> {
    const missing = this.getMissingConfig();
    if (missing.length > 0) {
      return failureResult('notion', new PMConfigError('notion', missing));
    }

    const start = Date.now();
    try {
      // Test 1: check authentication via /users/me
      const user = (await this.notionFetch('/users/me')) as Record<string, unknown>;
      const elapsed = Date.now() - start;
      const name = (user.name as string) || '';

      // Test 2: verify database access
      const databaseId = this.getDatabaseId();
      if (databaseId) {
        try {
          await this.notionFetch(`/databases/${databaseId}`, 'GET', undefined, databaseId);
        } catch (err) {
          if (err instanceof PMNotFoundError) {
            return failureResult('notion', new PMNotFoundError('notion', databaseId, 'database'));
          }
          // Auth succeeded but database check failed for another reason – still report
          return failureResult(
            'notion',
            new PMConnectionError(
              'notion',
              `Authenticated but could not access database ${databaseId}`
            )
          );
        }
      }

      return successResult('notion', name ? `Authenticated as ${name}` : undefined, elapsed);
    } catch (err) {
      if (
        err instanceof PMAuthError ||
        err instanceof PMConnectionError ||
        err instanceof PMConfigError
      ) {
        return failureResult('notion', err);
      }
      return failureResult(
        'notion',
        new PMConnectionError('notion', (err as Error).message, undefined, err)
      );
    }
  }

  async getTicket(ticketId: string): Promise<Ticket | null> {
    try {
      const page = (await this.notionFetch(
        `/pages/${ticketId}`,
        'GET',
        undefined,
        ticketId
      )) as Record<string, unknown>;
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
      const response = (await this.notionFetch(`/databases/${databaseId}/query`, 'POST', {
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

  // --- parsing helpers (public for testing) ---

  parseNotionPage(page: Record<string, unknown>): Ticket {
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

// ─── GitHub Issues Client ─────────────────────────────────────────────────────

/**
 * GitHub Issues integration using the `gh` CLI.
 *
 * Unlike the other PM clients, this one keeps using `gh` CLI via execa because:
 * - gh CLI handles OAuth/token management automatically
 * - It respects the user's `gh auth` session
 * - No separate API token needed
 */
export class GitHubIssueClient extends ProjectManagementClient {
  readonly tool = 'github' as const;

  getMissingConfig(): string[] {
    // GitHub uses gh CLI auth – we detect this dynamically in testConnection
    return [];
  }

  async isConfigured(): Promise<boolean> {
    try {
      await execa('gh', ['auth', 'status']);
      return true;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<PMConnectionTestResult> {
    const start = Date.now();
    try {
      // Check gh CLI is installed
      try {
        await execa('gh', ['--version']);
      } catch {
        return failureResult('github', new PMConfigError('github', ['gh CLI not installed']));
      }

      // Check auth status
      const { stdout: authStatus } = await execa('gh', ['auth', 'status']);
      const elapsed = Date.now() - start;

      // Extract account info from auth status output
      const accountMatch = authStatus.match(/Logged in to .+ as (\S+)/);
      const account = accountMatch ? accountMatch[1] : undefined;

      // Verify repo access
      let repoInfo: string | undefined;
      try {
        const { stdout: repoJson } = await execa('gh', ['repo', 'view', '--json', 'nameWithOwner']);
        const repo = JSON.parse(repoJson);
        repoInfo = repo.nameWithOwner;
      } catch {
        // Not in a GitHub repo, but auth works – that's still a success
      }

      const info = [
        account ? `Authenticated as ${account}` : 'Authenticated',
        repoInfo ? `repo: ${repoInfo}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      return successResult('github', info, elapsed);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('not logged') || msg.includes('auth login')) {
        return failureResult(
          'github',
          new PMAuthError('github', 'Not authenticated — run `gh auth login`')
        );
      }
      return failureResult('github', new PMConnectionError('github', msg, undefined, err));
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

  // --- parsing helpers (public for testing) ---

  parseGitHubIssue(issue: Record<string, unknown>): Ticket {
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

  inferTypeFromLabels(labels: string[]): 'bug' | 'feature' | 'task' | 'story' | 'epic' | 'other' {
    const joined = labels.join(' ').toLowerCase();
    if (joined.includes('bug')) return 'bug';
    if (joined.includes('feature') || joined.includes('enhancement')) return 'feature';
    if (joined.includes('epic')) return 'epic';
    return 'task';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

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
