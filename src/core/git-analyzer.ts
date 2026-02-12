import simpleGit, { SimpleGit } from 'simple-git';
import { Commit, CommitOptions, DiffStats } from '../types';

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

  async getDefaultBranch(): Promise<string> {
    try {
      // Try to get the remote's default branch
      const result = await this.git.raw([
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
        '--short',
      ]);
      return result.trim().replace('origin/', '');
    } catch {
      // If that fails, check common default branches
      try {
        await this.git.raw(['rev-parse', '--verify', 'main']);
        return 'main';
      } catch {
        try {
          await this.git.raw(['rev-parse', '--verify', 'master']);
          return 'master';
        } catch {
          // Fallback to current branch
          return await this.getCurrentBranch();
        }
      }
    }
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

    // Use %x00 (null byte) as delimiter to handle messages with pipes
    args.push('--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%ai%x00');

    const result = await this.git.raw(args);

    const commits = result
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\x00'); // Split by null byte
        const [hash, message, body, author, _authorEmail, date] = parts;
        
        // Skip if essential fields are missing
        if (!hash || !message || !author || !date) {
          return null;
        }
        
        return {
          hash,
          message,
          author,
          date: new Date(date),
          body: body || '',
        };
      })
      .filter((commit): commit is Commit => commit !== null);

    return commits;
  }

  async getDiff(base?: string, head: string = 'HEAD'): Promise<string> {
    const baseBranch = base || (await this.getDefaultBranch());
    const diff = await this.git.diff([`${baseBranch}...${head}`]);
    return diff;
  }

  async getDiffStats(base?: string, head: string = 'HEAD'): Promise<DiffStats> {
    const baseBranch = base || (await this.getDefaultBranch());
    const diffSummary = await this.git.diffSummary([`${baseBranch}...${head}`]);

    return {
      filesChanged: diffSummary.files.length,
      insertions: diffSummary.insertions,
      deletions: diffSummary.deletions,
    };
  }

  async getChangedFiles(base?: string, head: string = 'HEAD'): Promise<string[]> {
    const baseBranch = base || (await this.getDefaultBranch());
    const diff = await this.git.diff([`${baseBranch}...${head}`, '--name-only']);
    return diff.split('\n').filter(Boolean);
  }

  async getChangedFilesForCommit(commitHash: string): Promise<string[]> {
    try {
      const result = await this.git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', commitHash]);
      return result.split('\n').filter(Boolean);
    } catch {
      return [];
    }
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
