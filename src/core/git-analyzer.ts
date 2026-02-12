import simpleGit, { SimpleGit, LogResult } from 'simple-git';
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
    const logOptions: any = {
      format: {
        hash: '%H',
        message: '%s',
        body: '%b',
        author: '%an',
        date: '%ai',
      },
    };

    if (options.since) {
      logOptions.from = options.since.toISOString();
    }

    if (options.until) {
      logOptions.to = options.until.toISOString();
    }

    if (options.author) {
      logOptions.author = options.author;
    }

    const log: LogResult = await this.git.log(logOptions);

    return log.all.map((commit: any) => ({
      hash: commit.hash,
      message: commit.message,
      author: commit.author,
      date: new Date(commit.date),
      body: commit.body,
    }));
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
