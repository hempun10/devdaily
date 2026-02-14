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

    // Use unique delimiters for field and record separation
    const FIELD_SEP = '<<<DD_FIELD>>>';
    const RECORD_SEP = '<<<DD_RECORD>>>';
    args.push(
      `--format=${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%ai`
    );

    const result = await this.git.raw(args);

    if (!result || !result.trim()) {
      return [];
    }

    const commits = result
      .split(RECORD_SEP)
      .filter(Boolean)
      .map((record) => {
        const parts = record.trim().split(FIELD_SEP);
        if (parts.length < 5) {
          return null;
        }
        const [hash, message, author, _authorEmail, date] = parts;
        return {
          hash: hash || '',
          message: message || '',
          author: author || '',
          date: new Date(date || Date.now()),
          body: '', // Skip body to avoid newline issues
        };
      })
      .filter((c): c is Commit => c !== null && !!c.message);

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

  async getRepoRoot(): Promise<string> {
    const root = await this.git.revparse(['--show-toplevel']);
    return root.trim();
  }
}
