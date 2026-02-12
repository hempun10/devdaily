import type { ConventionalCommit } from '../types/index.js';

const COMMIT_PATTERN = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\([^\)]+\))?(!)?:\s*(.+)$/;

export function parseConventionalCommit(message: string): ConventionalCommit | null {
  const match = message.match(COMMIT_PATTERN);
  
  if (!match) {
    return null;
  }

  const [, type, scope, breaking, subject] = match;

  return {
    type: type as ConventionalCommit['type'],
    scope: scope?.replace(/[()]/g, ''),
    subject: subject.trim(),
    breaking: breaking === '!',
  };
}

export function extractIssueNumbers(text: string): string[] {
  const issuePattern = /#(\d+)/g;
  const matches = text.matchAll(issuePattern);
  return Array.from(matches, (m) => `#${m[1]}`);
}

export function generatePRTitle(commits: string[]): string {
  // Try to parse conventional commits
  const parsed = commits
    .map(parseConventionalCommit)
    .filter((c): c is ConventionalCommit => c !== null);

  if (parsed.length === 0) {
    // Fallback: use first commit message
    return commits[0] || 'Update';
  }

  // Group by type
  const features = parsed.filter((c) => c.type === 'feat');
  const fixes = parsed.filter((c) => c.type === 'fix');

  if (features.length > 0) {
    return features[0].subject;
  }

  if (fixes.length > 0) {
    return `Fix: ${fixes[0].subject}`;
  }

  return parsed[0].subject;
}

export function categorizePRType(commits: string[]): string {
  const parsed = commits
    .map(parseConventionalCommit)
    .filter((c): c is ConventionalCommit => c !== null);

  const hasFeatures = parsed.some((c) => c.type === 'feat');
  const hasFixes = parsed.some((c) => c.type === 'fix');
  const hasBreaking = parsed.some((c) => c.breaking);

  if (hasBreaking) return 'breaking';
  if (hasFeatures) return 'feature';
  if (hasFixes) return 'bugfix';
  return 'chore';
}
