/**
 * Auto-Snapshot — Silent side-effect snapshots for existing commands
 *
 * This module provides a fire-and-forget snapshot mechanism that:
 *  - Runs in the background without blocking the main command
 *  - Never throws or crashes the parent command
 *  - Respects the `journal.autoSnapshot` config flag
 *  - Takes a "light" snapshot (no PRs/tickets) for speed
 *  - Logs quietly (or not at all) depending on `journal.quiet`
 *
 * Usage in any command:
 *   import { sideEffectSnapshot } from '../core/auto-snapshot.js';
 *   // At the end of your command's action:
 *   await sideEffectSnapshot({ source: 'standup' });
 */

import { getConfig } from '../config/index.js';
import { SnapshotBuilder, type SnapshotOptions, type SnapshotResult } from './snapshot-builder.js';
import { WorkJournal } from './work-journal.js';
import { GitAnalyzer } from './git-analyzer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SideEffectSnapshotOptions {
  /** Which command triggered this snapshot (used as a tag) */
  source: 'standup' | 'pr' | 'week' | 'context' | 'recall' | 'post-commit' | 'post-checkout';

  /** Optional note to attach */
  note?: string;

  /** Extra tags beyond the auto-generated ones */
  tags?: string[];

  /** Override project ID */
  projectId?: string;

  /** Override date */
  date?: string;

  /** Force snapshot even if autoSnapshot config is false */
  force?: boolean;

  /** Show a message when snapshot is saved (overrides journal.quiet) */
  verbose?: boolean;

  /** Debug mode */
  debug?: boolean;
}

export interface SideEffectResult {
  /** Whether a snapshot was actually taken */
  taken: boolean;
  /** Reason it was skipped (if not taken) */
  skipReason?: string;
  /** The snapshot result (if taken) */
  result?: SnapshotResult;
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Take a silent, non-blocking snapshot as a side-effect of another command.
 *
 * This is the primary function commands should call. It:
 *  1. Checks if auto-snapshot is enabled in config
 *  2. Checks if we're in a git repo
 *  3. Takes a light snapshot (fast — no PR/ticket fetching)
 *  4. Saves it to the journal with a source tag
 *  5. Never throws — returns a result indicating what happened
 */
export async function sideEffectSnapshot(
  options: SideEffectSnapshotOptions
): Promise<SideEffectResult> {
  try {
    const config = getConfig();
    const journalConfig = config.journal ?? { autoSnapshot: true, quiet: true };

    // Check if auto-snapshot is enabled (unless forced)
    if (!options.force && !journalConfig.autoSnapshot) {
      return { taken: false, skipReason: 'autoSnapshot disabled in config' };
    }

    // Check if we're in a git repo
    const git = new GitAnalyzer();
    if (!(await git.isRepository())) {
      return { taken: false, skipReason: 'not a git repository' };
    }

    // Build snapshot options — always use light mode for speed
    const snapshotOpts: SnapshotOptions = {
      date: options.date,
      projectId: options.projectId,
      skipPRs: true,
      skipTickets: true,
      includeBranches: false,
      includeUncommitted: true,
      debug: options.debug,
      note: options.note,
      tags: [...(options.tags ?? []), `auto:${options.source}`],
    };

    const builder = new SnapshotBuilder(undefined, options.debug ?? false);
    const result = await builder.takeLightSnapshot(snapshotOpts);

    // Save to journal
    const journal = new WorkJournal();
    journal.saveSnapshot(result.snapshot);

    // Log if not quiet
    const quiet = options.verbose !== undefined ? !options.verbose : journalConfig.quiet;
    if (!quiet && process.env.DEVD_QUIET !== '1') {
      const tag = options.source;
      // Use stderr so it doesn't interfere with piped output
      process.stderr.write(`\x1b[2m📸 Snapshot saved (via ${tag})\x1b[0m\n`);
    }

    return { taken: true, result };
  } catch {
    // Never crash the parent command
    if (options.debug) {
      process.stderr.write(`\x1b[2m⚠ Auto-snapshot failed (non-fatal)\x1b[0m\n`);
    }
    return { taken: false, skipReason: 'snapshot failed (non-fatal)' };
  }
}

/**
 * Fire-and-forget variant — doesn't even await the result.
 *
 * Use this when you absolutely don't want to add any latency to the command.
 * The snapshot runs in the background and errors are silently swallowed.
 */
export function fireAndForgetSnapshot(options: SideEffectSnapshotOptions): void {
  sideEffectSnapshot(options).catch(() => {
    // Intentionally swallowed — fire and forget
  });
}

// ─── Git Hook Helpers ─────────────────────────────────────────────────────────

/**
 * Generate the content for a post-commit git hook that triggers a snapshot.
 */
export function generatePostCommitHook(): string {
  return `#!/bin/sh
# DevDaily auto-snapshot — captures work state after each commit
# Installed by: devdaily init --git-hooks
# Remove this file to disable post-commit snapshots

# Only run if devdaily is installed
if ! command -v devdaily >/dev/null 2>&1; then
  exit 0
fi

# Run snapshot in background so it doesn't slow down commits
(devdaily snapshot --light --tag auto:post-commit 2>/dev/null &)

exit 0
`;
}

/**
 * Generate the content for a post-checkout git hook that triggers a snapshot.
 */
export function generatePostCheckoutHook(): string {
  return `#!/bin/sh
# DevDaily auto-snapshot — captures work state when switching branches
# Installed by: devdaily init --git-hooks
# Remove this file to disable post-checkout snapshots
#
# Arguments from git:
#   $1 = previous HEAD ref
#   $2 = new HEAD ref
#   $3 = 1 if branch checkout, 0 if file checkout

PREV_REF="$1"
NEW_REF="$2"
IS_BRANCH_CHECKOUT="$3"

# Only run on branch checkouts (not file checkouts)
if [ "$IS_BRANCH_CHECKOUT" != "1" ]; then
  exit 0
fi

# Skip if refs are the same (no actual branch change)
if [ "$PREV_REF" = "$NEW_REF" ]; then
  exit 0
fi

# Only run if devdaily is installed
if ! command -v devdaily >/dev/null 2>&1; then
  exit 0
fi

# Run snapshot in background so it doesn't slow down checkout
(devdaily snapshot --light --tag auto:post-checkout --note "Switched branch" 2>/dev/null &)

exit 0
`;
}

/**
 * Install git hooks into the current repository.
 *
 * Returns an object describing what was installed and what was skipped.
 * Respects existing hooks — if a hook already exists and isn't ours, it
 * appends a call to devdaily instead of overwriting.
 */
export async function installGitHooks(options?: {
  postCommit?: boolean;
  postCheckout?: boolean;
  force?: boolean;
}): Promise<{
  installed: string[];
  skipped: string[];
  warnings: string[];
}> {
  const { existsSync, writeFileSync, readFileSync, chmodSync, mkdirSync } = await import('fs');
  const { join } = await import('path');

  const git = new GitAnalyzer();
  const installed: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  if (!(await git.isRepository())) {
    warnings.push('Not a git repository — cannot install hooks');
    return { installed, skipped, warnings };
  }

  let repoRoot: string;
  try {
    repoRoot = await git.getRepoRoot();
  } catch {
    warnings.push('Could not determine repository root');
    return { installed, skipped, warnings };
  }

  // Determine hooks directory (respects core.hooksPath config)
  let hooksDir: string;
  try {
    const { execSync } = await import('child_process');
    const customPath = execSync('git config core.hooksPath', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
    hooksDir = customPath.startsWith('/') ? customPath : join(repoRoot, customPath);
  } catch {
    hooksDir = join(repoRoot, '.git', 'hooks');
  }

  // Ensure hooks directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const DEVDAILY_MARKER = '# DevDaily auto-snapshot';

  const installHook = (name: string, content: string, enabled: boolean): void => {
    if (!enabled) {
      skipped.push(name);
      return;
    }

    const hookPath = join(hooksDir, name);

    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, 'utf-8');

      // If it's already our hook, skip or overwrite
      if (existing.includes(DEVDAILY_MARKER)) {
        if (options?.force) {
          writeFileSync(hookPath, content);
          chmodSync(hookPath, 0o755);
          installed.push(`${name} (overwritten)`);
        } else {
          skipped.push(`${name} (already installed)`);
        }
        return;
      }

      // There's an existing hook that isn't ours — append
      const appendSnippet =
        name === 'post-commit'
          ? `\n\n${DEVDAILY_MARKER}\nif command -v devdaily >/dev/null 2>&1; then\n  (devdaily snapshot --light --tag auto:post-commit 2>/dev/null &)\nfi\n`
          : `\n\n${DEVDAILY_MARKER}\nif [ "$3" = "1" ] && command -v devdaily >/dev/null 2>&1; then\n  (devdaily snapshot --light --tag auto:post-checkout --note "Switched branch" 2>/dev/null &)\nfi\n`;

      writeFileSync(hookPath, existing + appendSnippet);
      chmodSync(hookPath, 0o755);
      installed.push(`${name} (appended to existing hook)`);
      warnings.push(
        `${name}: Existing hook found — appended devdaily call. Review ${hookPath} to verify.`
      );
      return;
    }

    // No existing hook — write fresh
    writeFileSync(hookPath, content);
    chmodSync(hookPath, 0o755);
    installed.push(name);
  };

  const doPostCommit = options?.postCommit ?? true;
  const doPostCheckout = options?.postCheckout ?? true;

  installHook('post-commit', generatePostCommitHook(), doPostCommit);
  installHook('post-checkout', generatePostCheckoutHook(), doPostCheckout);

  return { installed, skipped, warnings };
}

/**
 * Remove devdaily git hooks from the current repository.
 */
export async function removeGitHooks(): Promise<{
  removed: string[];
  warnings: string[];
}> {
  const { existsSync, readFileSync, writeFileSync, unlinkSync } = await import('fs');
  const { join } = await import('path');

  const git = new GitAnalyzer();
  const removed: string[] = [];
  const warnings: string[] = [];

  if (!(await git.isRepository())) {
    warnings.push('Not a git repository');
    return { removed, warnings };
  }

  let repoRoot: string;
  try {
    repoRoot = await git.getRepoRoot();
  } catch {
    warnings.push('Could not determine repository root');
    return { removed, warnings };
  }

  let hooksDir: string;
  try {
    const { execSync } = await import('child_process');
    const customPath = execSync('git config core.hooksPath', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
    hooksDir = customPath.startsWith('/') ? customPath : join(repoRoot, customPath);
  } catch {
    hooksDir = join(repoRoot, '.git', 'hooks');
  }

  const DEVDAILY_MARKER = '# DevDaily auto-snapshot';

  for (const hookName of ['post-commit', 'post-checkout']) {
    const hookPath = join(hooksDir, hookName);

    if (!existsSync(hookPath)) {
      continue;
    }

    const content = readFileSync(hookPath, 'utf-8');
    if (!content.includes(DEVDAILY_MARKER)) {
      continue;
    }

    // Check if the entire file is our hook (starts with our marker after shebang)
    const lines = content.split('\n');
    const isOurHook =
      lines[0].startsWith('#!/') && lines.some((l) => l.includes('Installed by: devdaily init'));

    if (isOurHook) {
      // Entire hook is ours — remove the file
      unlinkSync(hookPath);
      removed.push(hookName);
    } else {
      // Mixed hook — remove only our appended section
      const markerIndex = content.indexOf(`\n\n${DEVDAILY_MARKER}`);
      if (markerIndex !== -1) {
        // Find the end of our section (next double newline or end of file)
        const afterMarker = content.substring(markerIndex + 2);
        const fiEnd = afterMarker.indexOf('\nfi\n');
        const endIndex = fiEnd !== -1 ? markerIndex + 2 + fiEnd + 4 : content.length;

        const cleaned = content.substring(0, markerIndex) + content.substring(endIndex);
        writeFileSync(hookPath, cleaned);
        removed.push(`${hookName} (removed appended section)`);
      }
    }
  }

  return { removed, warnings };
}
