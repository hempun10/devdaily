import simpleGit, { SimpleGit } from 'simple-git';
import { Commit, CommitOptions, DiffStats } from '../types';

export class GitAnalyzer {
  private git: SimpleGit;

  constructor(repoPath?: string) {
    this.git = simpleGit(repoPath || process.cwd());
  }

  /**
   * Get files changed in a specific commit by hash
   */
  async getCommitFiles(commitHash: string): Promise<string[]> {
    try {
      const result = await this.git.raw([
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        commitHash,
      ]);
      return result.split('\n').filter(Boolean);
    } catch {
      return [];
    }
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
    // Body (%b) is last to handle multi-line content
    const FIELD_SEP = '<<<DD_FIELD>>>';
    const RECORD_SEP = '<<<DD_RECORD>>>';
    args.push(
      `--format=${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%ai${FIELD_SEP}%b`
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
        const [hash, message, author, _authorEmail, date, ...bodyParts] = parts;
        // Body might contain our delimiter if it has special content
        const body = bodyParts.join(FIELD_SEP).trim();
        return {
          hash: hash || '',
          message: message || '',
          author: author || '',
          date: new Date(date || Date.now()),
          body: body || undefined,
        } as Commit;
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

  /**
   * Get files changed in recent commits (fallback when diff fails)
   */
  async getFilesFromCommits(options: CommitOptions = {}): Promise<string[]> {
    const args: string[] = ['log', '--name-only', '--pretty=format:'];

    if (options.since) {
      args.push(`--since=${options.since.toISOString()}`);
    }

    if (options.until) {
      args.push(`--until=${options.until.toISOString()}`);
    }

    if (options.author) {
      args.push(`--author=${options.author}`);
    }

    const result = await this.git.raw(args);
    const files = result
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.startsWith('commit '));

    // Deduplicate
    return [...new Set(files)];
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

  /**
   * Get a truncated diff suitable for AI context.
   *
   * Returns the full `git diff --stat` plus a truncated unified diff
   * (capped at `maxLines` lines) so the AI can see WHAT actually changed,
   * not just filenames.
   */
  async getDiffForAI(
    base: string = 'main',
    head: string = 'HEAD',
    maxLines: number = 200
  ): Promise<{ stat: string; diff: string; truncated: boolean }> {
    // 1. diff --stat  (always short)
    let stat = '';
    try {
      stat = await this.git.raw(['diff', '--stat', `${base}...${head}`]);
    } catch {
      stat = '';
    }

    // 2. unified diff (may be huge — truncate)
    let rawDiff = '';
    let truncated = false;
    try {
      rawDiff = await this.git.raw(['diff', `${base}...${head}`]);
    } catch {
      rawDiff = '';
    }

    const lines = rawDiff.split('\n');
    if (lines.length > maxLines) {
      truncated = true;
      rawDiff =
        lines.slice(0, maxLines).join('\n') +
        `\n\n... (diff truncated — ${lines.length - maxLines} more lines)`;
    }

    return { stat: stat.trim(), diff: rawDiff.trim(), truncated };
  }

  /**
   * Auto-detect the repository's default branch.
   *
   * Strategy (in order of precedence):
   *  1. `git symbolic-ref refs/remotes/origin/HEAD` — works when the
   *     remote HEAD has been fetched (most reliable for cloned repos).
   *  2. `gh repo view --json defaultBranchRef` — queries GitHub API via
   *     the gh CLI (requires auth but always returns the correct value).
   *  3. Probe for common branch names (`main`, `master`, `develop`) by
   *     checking if the remote-tracking ref exists.
   *  4. Fall back to `"main"` as a last resort.
   */
  async getDefaultBranch(): Promise<string> {
    // Strategy 1: git symbolic-ref
    try {
      const ref = await this.git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      const branch = ref.trim().replace('refs/remotes/origin/', '');
      if (branch) return branch;
    } catch {
      // origin/HEAD not set — continue
    }

    // Strategy 2: gh CLI (GitHub only)
    try {
      const { execa } = await import('execa');
      const { stdout } = await execa('gh', ['repo', 'view', '--json', 'defaultBranchRef'], {
        timeout: 10000,
      });
      const data = JSON.parse(stdout);
      const branch = data?.defaultBranchRef?.name;
      if (branch) return branch;
    } catch {
      // gh not installed or not a GitHub repo — continue
    }

    // Strategy 3: probe common branch names on the remote
    const candidates = ['main', 'master', 'develop'];
    for (const candidate of candidates) {
      try {
        await this.git.raw(['rev-parse', '--verify', `refs/remotes/origin/${candidate}`]);
        return candidate;
      } catch {
        // branch doesn't exist on remote — try next
      }
    }

    // Strategy 4: ultimate fallback
    return 'main';
  }
}
