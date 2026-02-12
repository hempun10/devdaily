import { Command } from 'commander';
import { execa } from 'execa';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';

const { colors } = UI;

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  fix?: string;
}

/**
 * Check if a command exists
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execa('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get version of a command
 */
async function getVersion(cmd: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { stdout } = await execa(cmd, args);
    return stdout.trim().split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Check if gh is authenticated
 */
async function isGhAuthenticated(): Promise<boolean> {
  try {
    await execa('gh', ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check which Copilot CLI is installed
 * Returns: 'new' for copilot CLI, 'legacy' for gh copilot extension, null if neither
 */
async function getCopilotStatus(): Promise<{ type: 'new' | 'legacy' | null; version?: string }> {
  // Check for new Copilot CLI first (preferred)
  try {
    const { stdout } = await execa('copilot', ['--version']);
    return { type: 'new', version: stdout.trim().split('\n')[0] };
  } catch {
    // Fallback to legacy gh copilot extension
    try {
      const { stdout } = await execa('gh', ['extension', 'list']);
      if (stdout.includes('copilot')) {
        return { type: 'legacy', version: 'gh extension' };
      }
    } catch {
      // Ignore
    }
    return { type: null };
  }
}

/**
 * Run all diagnostic checks
 */
async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // Check Node.js
  const nodeVersion = await getVersion('node');
  if (nodeVersion) {
    const major = parseInt(nodeVersion.replace('v', '').split('.')[0]);
    if (major >= 18) {
      checks.push({
        name: 'Node.js',
        status: 'ok',
        message: nodeVersion,
      });
    } else {
      checks.push({
        name: 'Node.js',
        status: 'error',
        message: `${nodeVersion} (requires >= 18)`,
        fix: 'Install Node.js 18+ from https://nodejs.org',
      });
    }
  } else {
    checks.push({
      name: 'Node.js',
      status: 'error',
      message: 'Not found',
      fix: 'Install Node.js from https://nodejs.org',
    });
  }

  // Check Git
  const gitVersion = await getVersion('git');
  if (gitVersion) {
    checks.push({
      name: 'Git',
      status: 'ok',
      message: gitVersion,
    });
  } else {
    checks.push({
      name: 'Git',
      status: 'error',
      message: 'Not found',
      fix: 'Install Git from https://git-scm.com',
    });
  }

  // Check GitHub CLI
  if (await commandExists('gh')) {
    const ghVersion = await getVersion('gh');
    checks.push({
      name: 'GitHub CLI',
      status: 'ok',
      message: ghVersion || 'Installed',
    });

    // Check gh auth
    if (await isGhAuthenticated()) {
      checks.push({
        name: 'GitHub Auth',
        status: 'ok',
        message: 'Authenticated',
      });
    } else {
      checks.push({
        name: 'GitHub Auth',
        status: 'error',
        message: 'Not authenticated',
        fix: 'Run: gh auth login',
      });
    }

    // Check Copilot CLI (new or legacy)
    const copilotStatus = await getCopilotStatus();
    if (copilotStatus.type === 'new') {
      checks.push({
        name: 'Copilot CLI',
        status: 'ok',
        message: copilotStatus.version || 'Installed',
      });
    } else if (copilotStatus.type === 'legacy') {
      checks.push({
        name: 'Copilot CLI',
        status: 'warning',
        message: 'Using deprecated gh extension. Upgrade to new CLI.',
        fix: 'Run: brew install copilot-cli',
      });
    } else {
      checks.push({
        name: 'Copilot CLI',
        status: 'error',
        message: 'Not found',
        fix: 'Run: brew install copilot-cli',
      });
    }
  } else {
    checks.push({
      name: 'GitHub CLI',
      status: 'error',
      message: 'Not found',
      fix: 'Install from https://cli.github.com',
    });
    checks.push({
      name: 'GitHub Auth',
      status: 'warning',
      message: 'Requires GitHub CLI',
    });
    checks.push({
      name: 'Copilot CLI',
      status: 'warning',
      message: 'Requires GitHub CLI',
    });
  }

  return checks;
}

export const doctorCommand = new Command('doctor')
  .description('Check system setup and diagnose issues')
  .option('--fix', 'Attempt to fix issues automatically')
  .action(async (options) => {
    console.log('');
    console.log(UI.header('System Check'));
    console.log('');

    const spinner = UI.spinner('Running diagnostics...');
    spinner.start();

    const checks = await runChecks();

    spinner.stop();

    // Display results
    console.log(UI.section('Prerequisites', '🔍'));
    console.log('');

    const statusIcon = {
      ok: colors.success(ASCII.status.check),
      warning: colors.warning(ASCII.status.warning),
      error: colors.error(ASCII.status.cross),
    };

    for (const check of checks) {
      const icon = statusIcon[check.status];
      const name = check.name.padEnd(15);
      const message =
        check.status === 'ok'
          ? colors.muted(check.message)
          : check.status === 'error'
            ? colors.error(check.message)
            : colors.warning(check.message);

      console.log(`  ${icon} ${name} ${message}`);

      if (check.fix && check.status === 'error') {
        console.log(`      ${colors.muted('Fix:')} ${colors.accent(check.fix)}`);
      }
    }

    console.log('');

    // Summary
    const errors = checks.filter((c) => c.status === 'error');
    const _warnings = checks.filter((c) => c.status === 'warning');

    if (errors.length === 0) {
      console.log(UI.success('All checks passed! DevDaily is ready to use.'));
    } else {
      console.log(UI.error(`${errors.length} issue(s) found`));
      console.log('');

      if (options.fix) {
        console.log(UI.info('Attempting automatic fixes...'));
        console.log('');

        for (const check of errors) {
          if (check.name === 'GitHub Auth') {
            console.log(`  ${colors.accent('→')} Running: gh auth login`);
            try {
              await execa('gh', ['auth', 'login'], { stdio: 'inherit' });
              console.log(UI.success('Authenticated successfully'));
            } catch {
              console.log(UI.error('Authentication failed'));
            }
          } else if (check.name === 'Copilot CLI') {
            console.log(`  ${colors.accent('→')} Running: brew install copilot-cli`);
            try {
              await execa('brew', ['install', 'copilot-cli'], { stdio: 'inherit' });
              console.log(UI.success('Copilot CLI installed'));
            } catch {
              console.log(UI.error('Installation failed. Try manually: brew install copilot-cli'));
            }
          }
        }
      } else {
        console.log(UI.info('Run `devdaily doctor --fix` to attempt automatic fixes'));
      }
    }

    console.log('');

    // Quick setup guide if issues found
    if (errors.length > 0) {
      console.log(UI.section('Quick Setup Guide', '📋'));
      console.log('');
      console.log(
        '  ' + colors.muted('1.') + ' Install GitHub CLI: ' + colors.accent('brew install gh')
      );
      console.log('  ' + colors.muted('2.') + ' Authenticate: ' + colors.accent('gh auth login'));
      console.log(
        '  ' +
          colors.muted('3.') +
          ' Install Copilot CLI: ' +
          colors.accent('brew install copilot-cli')
      );
      console.log(
        '  ' + colors.muted('4.') + ' Set up DevDaily: ' + colors.accent('devdaily init')
      );
      console.log('');
    }
  });
