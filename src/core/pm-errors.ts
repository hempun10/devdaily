/**
 * PM Error Types - Structured error handling for project management integrations
 *
 * Provides actionable error messages so users know exactly what went wrong
 * and how to fix it, rather than silent failures.
 */

export type PMTool = 'github' | 'jira' | 'linear' | 'notion';

/**
 * Base error for all PM integration failures
 */
export class PMError extends Error {
  readonly tool: PMTool;
  readonly hint: string;

  constructor(tool: PMTool, message: string, hint: string, cause?: unknown) {
    super(message);
    this.name = 'PMError';
    this.tool = tool;
    this.hint = hint;
    if (cause) this.cause = cause;
  }

  /**
   * Format for user-facing display (CLI output)
   */
  toUserMessage(): string {
    return `[${this.tool.toUpperCase()}] ${this.message}\n  → ${this.hint}`;
  }
}

/**
 * Authentication/authorization failures
 * Examples: invalid API token, expired credentials, missing permissions
 */
export class PMAuthError extends PMError {
  constructor(tool: PMTool, details?: string, cause?: unknown) {
    const message = details || `Authentication failed for ${tool}`;
    const hints: Record<PMTool, string> = {
      jira: 'Check JIRA_API_TOKEN and JIRA_EMAIL env vars, or run `devdaily init --pm` to reconfigure',
      linear: 'Check LINEAR_API_KEY env var, or generate a new key at Linear Settings → API',
      notion: 'Check NOTION_API_KEY env var, or create an integration at notion.so/my-integrations',
      github: 'Run `gh auth login` to authenticate with GitHub CLI',
    };
    super(tool, message, hints[tool], cause);
    this.name = 'PMAuthError';
  }
}

/**
 * Connection/network failures
 * Examples: DNS resolution failed, timeout, unreachable host
 */
export class PMConnectionError extends PMError {
  readonly statusCode?: number;

  constructor(tool: PMTool, details?: string, statusCode?: number, cause?: unknown) {
    const message = details || `Could not connect to ${tool}`;
    const hints: Record<PMTool, string> = {
      jira: 'Verify your Jira base URL (e.g., https://yourcompany.atlassian.net) and network connection',
      linear: 'Check your network connection — Linear API endpoint: https://api.linear.app/graphql',
      notion: 'Check your network connection — Notion API endpoint: https://api.notion.com',
      github: 'Check your network connection and verify `gh` CLI is working: `gh auth status`',
    };
    super(tool, message, hints[tool], cause);
    this.name = 'PMConnectionError';
    this.statusCode = statusCode;
  }
}

/**
 * Resource not found
 * Examples: ticket ID doesn't exist, project key is wrong, database not found
 */
export class PMNotFoundError extends PMError {
  readonly resourceId: string;

  constructor(tool: PMTool, resourceId: string, resourceType = 'ticket', cause?: unknown) {
    const message = `${resourceType} "${resourceId}" not found in ${tool}`;
    const hints: Record<PMTool, string> = {
      jira: `Verify the ticket ID format (e.g., PROJ-123) and that it exists in your Jira instance`,
      linear: `Verify the issue identifier (e.g., ENG-123) and that you have access to the team`,
      notion: `Verify the page/database ID and that your integration has access to it`,
      github: `Verify the issue number exists in this repository: gh issue view ${resourceId}`,
    };
    super(tool, message, hints[tool], cause);
    this.name = 'PMNotFoundError';
    this.resourceId = resourceId;
  }
}

/**
 * Rate limiting
 */
export class PMRateLimitError extends PMError {
  readonly retryAfterMs?: number;

  constructor(tool: PMTool, retryAfterMs?: number, cause?: unknown) {
    const retryStr = retryAfterMs ? ` Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.` : '';
    const message = `Rate limited by ${tool} API.${retryStr}`;
    super(tool, message, 'Wait a moment and try again, or reduce request frequency', cause);
    this.name = 'PMRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Configuration missing or invalid
 * Examples: no base URL set, no API key configured, invalid project key
 */
export class PMConfigError extends PMError {
  readonly missingFields: string[];

  constructor(tool: PMTool, missingFields: string[], cause?: unknown) {
    const fieldStr = missingFields.join(', ');
    const message = `${tool} integration is not fully configured — missing: ${fieldStr}`;
    const hints: Record<PMTool, string> = {
      jira: `Run \`devdaily init --pm\` or set env vars: ${missingFields.map((f) => jiraFieldToEnv(f)).join(', ')}`,
      linear: `Run \`devdaily init --pm\` or set env var: LINEAR_API_KEY`,
      notion: `Run \`devdaily init --pm\` or set env vars: ${missingFields.map((f) => notionFieldToEnv(f)).join(', ')}`,
      github: `Run \`gh auth login\` to authenticate with GitHub CLI`,
    };
    super(tool, message, hints[tool], cause);
    this.name = 'PMConfigError';
    this.missingFields = missingFields;
  }
}

/**
 * Invalid API response (unexpected shape, parse error)
 */
export class PMResponseError extends PMError {
  constructor(tool: PMTool, details?: string, cause?: unknown) {
    const message = details || `Unexpected response from ${tool} API`;
    super(
      tool,
      message,
      'This may indicate an API version mismatch or a temporary service issue. Try again or check the API status page.',
      cause
    );
    this.name = 'PMResponseError';
  }
}

// --- Helper mappings for env var hints ---

function jiraFieldToEnv(field: string): string {
  const map: Record<string, string> = {
    baseUrl: 'JIRA_BASE_URL',
    email: 'JIRA_EMAIL',
    apiToken: 'JIRA_API_TOKEN',
    projectKey: 'projectManagement.jira.projectKey in .devdaily.json',
  };
  return map[field] || field;
}

function notionFieldToEnv(field: string): string {
  const map: Record<string, string> = {
    apiKey: 'NOTION_API_KEY',
    databaseId: 'NOTION_DATABASE_ID',
  };
  return map[field] || field;
}

// --- Connection test result type ---

export interface PMConnectionTestResult {
  tool: PMTool;
  success: boolean;
  message: string;
  details: {
    /** Whether required credentials are present */
    credentialsFound: boolean;
    /** Whether the API responded successfully */
    apiReachable: boolean;
    /** Whether the credentials are valid (authenticated successfully) */
    authenticated: boolean;
    /** Detected project/team info (e.g., Jira project key, Linear team) */
    projectInfo?: string;
    /** Response time in milliseconds */
    responseTimeMs?: number;
  };
  error?: PMError;
}

/**
 * Create a successful connection test result
 */
export function successResult(
  tool: PMTool,
  projectInfo?: string,
  responseTimeMs?: number
): PMConnectionTestResult {
  return {
    tool,
    success: true,
    message: `Successfully connected to ${tool}${projectInfo ? ` (${projectInfo})` : ''}`,
    details: {
      credentialsFound: true,
      apiReachable: true,
      authenticated: true,
      projectInfo,
      responseTimeMs,
    },
  };
}

/**
 * Create a failed connection test result from a PMError
 */
export function failureResult(tool: PMTool, error: PMError): PMConnectionTestResult {
  const isAuthError = error instanceof PMAuthError;
  const isConfigError = error instanceof PMConfigError;
  const isConnectionError = error instanceof PMConnectionError;

  return {
    tool,
    success: false,
    message: error.message,
    details: {
      credentialsFound: !isConfigError,
      apiReachable: !isConnectionError,
      authenticated: !isAuthError,
    },
    error,
  };
}
