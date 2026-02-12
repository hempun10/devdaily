import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import type { Commit, CommitOptions, DiffStats } from '../types/index.js';

export class GitAnalyzer {
  private git: SimpleGit;

  constructor(repoPath?: string) {
    this.git = simpleGit(repoPath || process.cwd());
  }

  async isRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  async getCommits(options: CommitOptions = {}): Promise<Commit[]> {
    const args: string[] = ['log'];

    if (options.since) {
      args.push(`--since=${options.since.toISOString()}`);
    }

    if (options.until) {
      args.push(`--until=${options.until.toISOString()}`);
    }

    if (options.author) {
      args.push(`--author=${options.author}`);
    }

    args.push('--format=%H|%s|%b|%an|%ae|%ai');

    const result = await this.git.raw(args);

    const commits = result
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|');
        const [hash, message, body, author, _authorEmail, date] = parts;
        return {
          hash,
          message,
          author,
          date: new Date(date),
          body: body || '',
        };
      });

    return commits;
  }

  async getDiff(base: string = 'main', head: string = 'HEAD'): Promise<string> {
    const diff = await this.git.diff([`${base}...${head}`]);
    return diff;
  }

  async getDiffStats(base: string = 'main', head: string = 'HEAD'): Promise<DiffStats> {
    const diffSummary = await this.git.diffSummary([`${base}...${head}`]);

    return {
      filesChanged: diffSummary.files.length,
      insertions: diffSummary.insertions,
      deletions: diffSummary.deletions,
    };
  }

  async getChangedFiles(base: string = 'main', head: string = 'HEAD'): Promise<string[]> {
    const diff = await this.git.diff([`${base}...${head}`, '--name-only']);
    return diff.split('\n').filter(Boolean);
  }

  async getCurrentUser(): Promise<{ name: string; email: string }> {
    const name = await this.git.getConfig('user.name');
    const email = await this.git.getConfig('user.email');

    return {
      name: name.value || '',
      email: email.value || '',
    };
  }

  async getStatus(): Promise<{ modified: string[]; untracked: string[] }> {
    const status = await this.git.status();

    return {
      modified: status.modified,
      untracked: status.not_added,
    };
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }
}
