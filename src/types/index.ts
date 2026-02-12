// Core types
export interface Commit {
  hash: string;
  message: string;
  author: string;
  date: Date;
  body?: string;
}

export interface CommitOptions {
  since?: Date;
  until?: Date;
  author?: string;
  branch?: string;
}

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface StandupOptions {
  days?: number;
  since?: string;
  format?: 'markdown' | 'slack' | 'plain';
  copy?: boolean;
}

export interface StandupData {
  yesterday: string[];
  today: string[];
  blockers: string[];
  stats: DiffStats;
}

export interface PROptions {
  base?: string;
  create?: boolean;
  draft?: boolean;
  edit?: boolean;
  template?: string;
}

export interface PRDescription {
  title: string;
  whatChanged: string[];
  why: string;
  howToTest: string[];
  relatedIssues: string[];
  screenshots?: string[];
  breakingChanges?: string[];
}

export interface WeeklyOptions {
  week?: number;
  format?: 'manager' | 'detailed' | 'team';
}

export interface WeeklySummary {
  dateRange: { start: Date; end: Date };
  accomplishments: string[];
  metrics: {
    commits: number;
    prsMerged: number;
    issuesClosed: number;
    linesAdded: number;
    linesRemoved: number;
  };
  topAchievement: string;
}

export interface ConventionalCommit {
  type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore';
  scope?: string;
  subject: string;
  breaking: boolean;
}
