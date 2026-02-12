/**
 * GitHub Repository Helpers
 * Functions for interacting with GitHub API via gh CLI
 */

import { execa } from 'execa';

export interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}

export interface GitHubUser {
  login: string;
  name?: string;
}

export interface GitHubTeam {
  slug: string;
  name: string;
}

export interface RepoMetadata {
  owner: string;
  name: string;
  defaultBranch: string;
  labels: GitHubLabel[];
  collaborators: GitHubUser[];
  teams: GitHubTeam[];
}

/**
 * Get the current repository's owner and name
 */
export async function getRepoInfo(): Promise<{ owner: string; name: string } | null> {
  try {
    const { stdout } = await execa('gh', ['repo', 'view', '--json', 'owner,name']);
    const data = JSON.parse(stdout);
    return {
      owner: data.owner?.login || data.owner,
      name: data.name,
    };
  } catch {
    return null;
  }
}

/**
 * Get repository labels
 */
export async function getRepoLabels(): Promise<GitHubLabel[]> {
  try {
    const { stdout } = await execa('gh', ['label', 'list', '--json', 'name,color,description']);
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

/**
 * Get repository collaborators (people who can be assigned)
 */
export async function getRepoCollaborators(): Promise<GitHubUser[]> {
  try {
    const { stdout } = await execa('gh', [
      'api',
      'repos/{owner}/{repo}/collaborators',
      '--jq',
      '.[].login',
    ]);
    const logins = stdout.trim().split('\n').filter(Boolean);
    return logins.map((login) => ({ login }));
  } catch {
    return [];
  }
}

/**
 * Get assignable users for the repository
 */
export async function getAssignableUsers(): Promise<GitHubUser[]> {
  try {
    const { stdout } = await execa('gh', [
      'api',
      'repos/{owner}/{repo}/assignees',
      '--jq',
      '.[].login',
    ]);
    const logins = stdout.trim().split('\n').filter(Boolean);
    return logins.map((login) => ({ login }));
  } catch {
    return [];
  }
}

/**
 * Get the current user's login
 */
export async function getCurrentUser(): Promise<string | null> {
  try {
    const { stdout } = await execa('gh', ['api', 'user', '--jq', '.login']);
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get team members who can review PRs
 */
export async function getTeamReviewers(): Promise<GitHubTeam[]> {
  try {
    const { stdout } = await execa('gh', [
      'api',
      'repos/{owner}/{repo}/teams',
      '--jq',
      '.[] | {slug: .slug, name: .name}',
    ]);
    // Parse JSON lines
    const lines = stdout.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Fetch all repository metadata in parallel
 */
export async function getRepoMetadata(): Promise<RepoMetadata | null> {
  const repoInfo = await getRepoInfo();
  if (!repoInfo) return null;

  const [labels, collaborators, teams] = await Promise.all([
    getRepoLabels(),
    getAssignableUsers(),
    getTeamReviewers(),
  ]);

  // Get default branch
  let defaultBranch = 'main';
  try {
    const { stdout } = await execa('gh', ['repo', 'view', '--json', 'defaultBranchRef']);
    const data = JSON.parse(stdout);
    defaultBranch = data.defaultBranchRef?.name || 'main';
  } catch {
    // Keep default
  }

  return {
    owner: repoInfo.owner,
    name: repoInfo.name,
    defaultBranch,
    labels,
    collaborators,
    teams,
  };
}

/**
 * Create a PR with full options
 */
export interface CreatePROptions {
  title: string;
  body: string;
  base: string;
  head?: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
  teamReviewers?: string[];
  milestone?: string;
  project?: string;
}

export async function createPR(options: CreatePROptions): Promise<{ url: string; number: number }> {
  const args = [
    'pr',
    'create',
    '--title',
    options.title,
    '--body',
    options.body,
    '--base',
    options.base,
  ];

  if (options.head) {
    args.push('--head', options.head);
  }

  if (options.draft) {
    args.push('--draft');
  }

  if (options.labels && options.labels.length > 0) {
    args.push('--label', options.labels.join(','));
  }

  if (options.assignees && options.assignees.length > 0) {
    args.push('--assignee', options.assignees.join(','));
  }

  if (options.reviewers && options.reviewers.length > 0) {
    args.push('--reviewer', options.reviewers.join(','));
  }

  // Note: team reviewers need special handling in gh cli

  const { stdout } = await execa('gh', args);

  // Parse PR URL and number from output
  const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);

  return {
    url: stdout.trim(),
    number: urlMatch ? parseInt(urlMatch[1], 10) : 0,
  };
}

/**
 * Get PR preview URL (for opening in browser)
 */
export function getPRPreviewUrl(owner: string, repo: string, base: string, head: string): string {
  return `https://github.com/${owner}/${repo}/compare/${base}...${head}?expand=1`;
}
