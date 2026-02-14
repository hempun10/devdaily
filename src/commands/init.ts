import { Command } from 'commander';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import inquirer from 'inquirer';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { ConfigManager, type Secrets } from '../config/index.js';
import { GitAnalyzer } from '../core/git-analyzer.js';
import { generateSamplePRPrompt, findPRPromptFile } from '../core/pr-prompt.js';
import { installGitHooks, removeGitHooks } from '../core/auto-snapshot.js';

const { colors } = UI;

// Shell config file paths
const SHELL_CONFIGS = {
  zsh: join(homedir(), '.zshrc'),
  bash: join(homedir(), '.bashrc'),
  fish: join(homedir(), '.config', 'fish', 'config.fish'),
};

// Alias to add
const ALIAS_LINE = {
  zsh: `\n# DevDaily AI alias\nalias dd='devdaily'\n`,
  bash: `\n# DevDaily AI alias\nalias dd='devdaily'\n`,
  fish: `\n# DevDaily AI alias\nalias dd 'devdaily'\n`,
};

// Shell completions
const COMPLETIONS = {
  zsh: `
# DevDaily AI completions
_devdaily() {
  local commands="standup pr week dash config init help"
  local standup_opts="--days --format --no-copy"
  local pr_opts="--base --create --draft --no-copy"
  local week_opts="--last --start --no-copy"

  _arguments \\
    '1:command:($commands)' \\
    '*::arg:->args'

  case $words[1] in
    standup|s|su)
      _arguments $standup_opts
      ;;
    pr|p)
      _arguments $pr_opts
      ;;
    week|w)
      _arguments $week_opts
      ;;
  esac
}
compdef _devdaily devdaily
compdef _devdaily dd
`,
  bash: `
# DevDaily AI completions
_devdaily_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="standup pr week dash config init help"

  if [ \${COMP_CWORD} -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
  fi
}
complete -F _devdaily_completions devdaily
complete -F _devdaily_completions dd
`,
  fish: `
# DevDaily AI completions
complete -c devdaily -n __fish_use_subcommand -a standup -d 'Generate standup notes'
complete -c devdaily -n __fish_use_subcommand -a pr -d 'Generate PR description'
complete -c devdaily -n __fish_use_subcommand -a week -d 'Generate weekly summary'
complete -c devdaily -n __fish_use_subcommand -a dash -d 'Open dashboard'
complete -c devdaily -n __fish_use_subcommand -a config -d 'Manage configuration'
complete -c devdaily -n __fish_use_subcommand -a init -d 'Initialize DevDaily'
complete -c dd -w devdaily
`,
};

/**
 * Detect current shell
 */
const detectShell = (): 'zsh' | 'bash' | 'fish' => {
  const shell = process.env.SHELL || '';

  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  return 'bash';
};

/**
 * Check if alias already exists
 */
const hasAlias = (shell: 'zsh' | 'bash' | 'fish'): boolean => {
  const configPath = SHELL_CONFIGS[shell];

  if (!existsSync(configPath)) return false;

  const content = readFileSync(configPath, 'utf-8');
  return content.includes("alias dd='devdaily'") || content.includes("alias dd 'devdaily'");
};

/**
 * Add alias to shell config
 */
const addAlias = (shell: 'zsh' | 'bash' | 'fish'): void => {
  const configPath = SHELL_CONFIGS[shell];
  const aliasLine = ALIAS_LINE[shell];

  appendFileSync(configPath, aliasLine);
};

/**
 * Add completions to shell config
 */
const addCompletions = (shell: 'zsh' | 'bash' | 'fish'): void => {
  const configPath = SHELL_CONFIGS[shell];
  const completions = COMPLETIONS[shell];

  appendFileSync(configPath, completions);
};

/**
 * Check if completions already exist
 */
const hasCompletions = (shell: 'zsh' | 'bash' | 'fish'): boolean => {
  const configPath = SHELL_CONFIGS[shell];

  if (!existsSync(configPath)) return false;

  const content = readFileSync(configPath, 'utf-8');
  return content.includes('DevDaily AI completions');
};

export const initCommand = new Command('init')
  .description('Set up DevDaily (aliases, shell completions, config)')
  .option('-g, --global', 'Set up globally for all projects')
  .option('--alias', 'Only set up shell alias (dd)')
  .option('--completions', 'Only set up shell completions')
  .option('--config', 'Only create config file')
  .option('--pm', 'Only set up project management integration')
  .option('--notifications', 'Only set up Slack/Discord notifications')
  .option('--git-hooks', 'Install git hooks for automatic snapshots (post-commit, post-checkout)')
  .option('--remove-hooks', 'Remove previously installed devdaily git hooks')
  .action(async (options) => {
    console.log('');
    console.log(UI.header('DevDaily Setup'));
    console.log('');

    const shell = detectShell();
    console.log(UI.info(`Detected shell: ${shell}`));
    console.log('');

    const tasks: Array<{ name: string; done: boolean; skipped: boolean }> = [];

    // Auto-detect default branch
    let detectedDefaultBranch = 'main';
    const git = new GitAnalyzer();
    const isRepo = await git.isRepository();

    if (isRepo) {
      const branchSpinner = UI.spinner('Detecting default branch...');
      branchSpinner.start();
      try {
        detectedDefaultBranch = await git.getDefaultBranch();
        branchSpinner.stop();
        console.log(UI.info(`Detected default branch: ${colors.accent(detectedDefaultBranch)}`));
      } catch {
        branchSpinner.stop();
        console.log(colors.muted('  Could not auto-detect default branch, using "main"'));
      }
    }

    // Check for existing PR prompt file
    let hasPRPrompt = false;
    if (isRepo) {
      try {
        const repoRoot = await git.getRepoRoot();
        hasPRPrompt = (await findPRPromptFile(repoRoot)) !== null;
      } catch {
        // ignore
      }
    }

    console.log('');

    // Interactive setup if no specific options
    // Handle --remove-hooks early
    if (options.removeHooks) {
      console.log(colors.bold('📸 Removing DevDaily Git Hooks'));
      console.log('');
      const removeResult = await removeGitHooks();
      if (removeResult.removed.length > 0) {
        for (const name of removeResult.removed) {
          console.log(UI.success(`Removed: ${name}`));
        }
      } else {
        console.log(UI.info('No devdaily git hooks found to remove.'));
      }
      for (const w of removeResult.warnings) {
        console.log(UI.warning(w));
      }
      console.log('');
      return;
    }

    const hasSpecificOption =
      options.alias ||
      options.completions ||
      options.config ||
      options.pm ||
      options.notifications ||
      options.gitHooks ||
      options.git_hooks;

    if (!hasSpecificOption) {
      const { features } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'features',
          message: 'What would you like to set up?',
          choices: [
            {
              name: `Shell alias (${colors.accent('dd')} → ${colors.primary('devdaily')})`,
              value: 'alias',
              checked: !hasAlias(shell),
            },
            {
              name: 'Shell completions (tab completion)',
              value: 'completions',
              checked: !hasCompletions(shell),
            },
            {
              name: `Create ${options.global ? 'global' : 'project'} config file`,
              value: 'config',
              checked: true,
            },
            {
              name: `${colors.accent('🎫')} Project management integration (Jira/Linear/Notion)`,
              value: 'pm',
              checked: true,
            },
            {
              name: `${colors.accent('🔀')} Default branch & PR settings`,
              value: 'branch',
              checked: true,
            },
            {
              name: `${colors.accent('📝')} PR description prompt file (.devdaily-pr-prompt.md)`,
              value: 'pr_prompt',
              checked: !hasPRPrompt,
            },
            {
              name: `${colors.accent('🔔')} Notifications (Slack/Discord webhooks)`,
              value: 'notifications',
              checked: false,
            },
            {
              name: `${colors.accent('📸')} Git hooks for automatic snapshots (post-commit, post-checkout)`,
              value: 'git_hooks',
              checked: false,
            },
          ],
        },
      ]);

      options.alias = features.includes('alias');
      options.completions = features.includes('completions');
      options.config = features.includes('config');
      options.pm = features.includes('pm');
      options.branch = features.includes('branch');
      options.pr_prompt = features.includes('pr_prompt');
      options.notifications = features.includes('notifications');
      options.git_hooks = options.gitHooks || features.includes('git_hooks');
    }

    console.log('');

    // Set up alias
    if (options.alias) {
      if (hasAlias(shell)) {
        console.log(colors.muted(`${ASCII.status.check} Shell alias already exists`));
        tasks.push({ name: 'Shell alias', done: false, skipped: true });
      } else {
        try {
          addAlias(shell);
          console.log(UI.success(`Added shell alias: ${colors.accent('dd')} → devdaily`));
          tasks.push({ name: 'Shell alias', done: true, skipped: false });
        } catch {
          console.log(UI.error('Failed to add shell alias'));
          tasks.push({ name: 'Shell alias', done: false, skipped: false });
        }
      }
    }

    // Set up completions
    if (options.completions) {
      if (hasCompletions(shell)) {
        console.log(colors.muted(`${ASCII.status.check} Shell completions already exist`));
        tasks.push({ name: 'Completions', done: false, skipped: true });
      } else {
        try {
          addCompletions(shell);
          console.log(UI.success('Added shell completions'));
          tasks.push({ name: 'Completions', done: true, skipped: false });
        } catch {
          console.log(UI.error('Failed to add completions'));
          tasks.push({ name: 'Completions', done: false, skipped: false });
        }
      }
    }

    // Set up project management
    if (options.pm) {
      console.log('');
      console.log(UI.divider());
      console.log('');
      console.log(colors.bold('🎫 Project Management Setup'));
      console.log(colors.muted('  Link your ticket system for richer AI context'));
      console.log('');

      const { pmTool } = await inquirer.prompt([
        {
          type: 'list',
          name: 'pmTool',
          message: 'Which project management tool do you use?',
          choices: [
            { name: '🐙 GitHub Issues (default, uses gh CLI)', value: 'github' },
            { name: '🔷 Jira', value: 'jira' },
            { name: '📐 Linear', value: 'linear' },
            { name: '📝 Notion', value: 'notion' },
            { name: '⏭️  Skip for now', value: 'none' },
          ],
        },
      ]);

      const configManager = ConfigManager.getInstance();
      const secrets: Secrets = {};
      let ticketPrefix = '';

      if (pmTool !== 'none' && pmTool !== 'github') {
        // Ask for ticket prefix
        const { prefix } = await inquirer.prompt([
          {
            type: 'input',
            name: 'prefix',
            message: 'Ticket prefix (e.g., PROJ, ENG, DEV):',
            default: '',
            validate: (input: string) => {
              if (!input) return true; // Optional
              if (/^[A-Z][A-Z0-9]*$/i.test(input)) return true;
              return 'Prefix should be letters/numbers (e.g., PROJ, ENG-1)';
            },
          },
        ]);
        ticketPrefix = prefix.toUpperCase();
      }

      // Tool-specific setup
      if (pmTool === 'jira') {
        console.log('');
        console.log(
          colors.muted('  Jira API credentials will be stored in .devdaily.secrets.json')
        );
        console.log(colors.muted('  This file will be added to .gitignore'));
        console.log('');

        const jiraAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Jira base URL:',
            default: 'https://yourcompany.atlassian.net',
            validate: (input: string) => input.startsWith('http') || 'Must be a valid URL',
          },
          {
            type: 'input',
            name: 'email',
            message: 'Your Jira email:',
          },
          {
            type: 'password',
            name: 'apiToken',
            message: 'Jira API token:',
            mask: '*',
          },
        ]);

        secrets.jira = {
          baseUrl: jiraAnswers.baseUrl,
          email: jiraAnswers.email,
          apiToken: jiraAnswers.apiToken,
        };
      } else if (pmTool === 'linear') {
        console.log('');
        console.log(colors.muted('  Get your API key from Linear Settings → API'));
        console.log('');

        const linearAnswers = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'Linear API key:',
            mask: '*',
          },
        ]);

        secrets.linear = {
          apiKey: linearAnswers.apiKey,
        };
      } else if (pmTool === 'notion') {
        console.log('');
        console.log(colors.muted('  Create an integration at notion.so/my-integrations'));
        console.log('');

        const notionAnswers = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'Notion API key:',
            mask: '*',
          },
          {
            type: 'input',
            name: 'databaseId',
            message: 'Notion database ID (for tasks):',
          },
        ]);

        secrets.notion = {
          apiKey: notionAnswers.apiKey,
          databaseId: notionAnswers.databaseId,
        };
      }

      // Save PM config
      if (pmTool !== 'none') {
        // Use type assertion since we're doing a partial update
        const pmConfig = {
          projectManagement: {
            tool: pmTool,
            ticketPrefix: ticketPrefix || undefined,
            jira: {},
            linear: {},
            notion: {},
          },
        } as Parameters<typeof configManager.update>[0];

        if (options.global) {
          configManager.update(pmConfig);
          configManager.saveGlobal();
        } else {
          configManager.saveLocal(pmConfig as Parameters<typeof configManager.saveLocal>[0]);
        }

        // Save secrets if any
        if (Object.keys(secrets).length > 0) {
          configManager.saveSecrets(secrets, options.global);

          // Add to gitignore
          if (!options.global) {
            const added = configManager.addSecretsToGitignore();
            if (added) {
              console.log(UI.success('Added .devdaily.secrets.json to .gitignore'));
            }
          }
        }

        console.log(UI.success(`Configured ${pmTool} integration`));
        tasks.push({ name: 'PM integration', done: true, skipped: false });
      } else {
        tasks.push({ name: 'PM integration', done: false, skipped: true });
      }
    }

    // Set up notifications
    if (options.notifications) {
      console.log('');
      console.log(UI.divider());
      console.log('');
      console.log(colors.bold('🔔 Notification Setup'));
      console.log(colors.muted('  Send standups to Slack or Discord automatically'));
      console.log('');

      const { notificationChannels } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'notificationChannels',
          message: 'Which notification channels do you want to set up?',
          choices: [
            { name: '💬 Slack (webhook)', value: 'slack' },
            { name: '🎮 Discord (webhook)', value: 'discord' },
          ],
        },
      ]);

      const configManager = ConfigManager.getInstance();
      const secrets: Secrets = {};
      const notificationConfig: {
        slack?: { enabled: boolean };
        discord?: { enabled: boolean };
      } = {};

      if (notificationChannels.includes('slack')) {
        console.log('');
        console.log(colors.muted('  Create a Slack webhook at: api.slack.com/apps'));
        console.log(colors.muted('  → Create App → Incoming Webhooks → Add New Webhook'));
        console.log('');

        const slackAnswers = await inquirer.prompt([
          {
            type: 'password',
            name: 'webhookUrl',
            message: 'Slack webhook URL:',
            mask: '*',
            validate: (input: string) =>
              input.startsWith('https://hooks.slack.com/') || 'Must be a valid Slack webhook URL',
          },
        ]);

        secrets.slack = {
          webhookUrl: slackAnswers.webhookUrl,
        };

        notificationConfig.slack = {
          enabled: true,
        };

        console.log(UI.success('Slack configured!'));
      }

      if (notificationChannels.includes('discord')) {
        console.log('');
        console.log(colors.muted('  Create a Discord webhook:'));
        console.log(colors.muted('  → Server Settings → Integrations → Webhooks → New Webhook'));
        console.log('');

        const discordAnswers = await inquirer.prompt([
          {
            type: 'password',
            name: 'webhookUrl',
            message: 'Discord webhook URL:',
            mask: '*',
            validate: (input: string) =>
              input.startsWith('https://discord.com/api/webhooks/') ||
              'Must be a valid Discord webhook URL',
          },
        ]);

        secrets.discord = {
          webhookUrl: discordAnswers.webhookUrl,
        };

        notificationConfig.discord = {
          enabled: true,
        };

        console.log(UI.success('Discord configured!'));
      }

      if (notificationChannels.length > 0) {
        // Save notification config - use type assertion for partial update
        const config = {
          notifications: {
            slack: { enabled: false, ...notificationConfig.slack },
            discord: { enabled: false, ...notificationConfig.discord },
            standupTimezone: 'America/New_York',
          },
        } as Parameters<typeof configManager.update>[0];

        if (options.global) {
          configManager.update(config);
          configManager.saveGlobal();
        } else {
          configManager.saveLocal(config as Parameters<typeof configManager.saveLocal>[0]);
        }

        // Save secrets
        if (Object.keys(secrets).length > 0) {
          configManager.saveSecrets(secrets, options.global);

          if (!options.global) {
            const added = configManager.addSecretsToGitignore();
            if (added) {
              console.log(UI.success('Added .devdaily.secrets.json to .gitignore'));
            }
          }
        }

        console.log('');
        console.log(colors.muted('  Usage:'));
        console.log(
          `    ${colors.primary('devdaily standup --send')}   ${colors.muted('# Send to all channels')}`
        );
        console.log(
          `    ${colors.primary('devdaily standup --slack')}  ${colors.muted('# Send to Slack only')}`
        );
        console.log(
          `    ${colors.primary('devdaily standup --discord')} ${colors.muted('# Send to Discord only')}`
        );

        tasks.push({ name: 'Notifications', done: true, skipped: false });
      } else {
        tasks.push({ name: 'Notifications', done: false, skipped: true });
      }
    }

    // Default branch & PR settings
    if (options.branch) {
      console.log('');
      console.log(UI.divider());
      console.log('');
      console.log(colors.bold('🔀 Default Branch & PR Settings'));
      console.log(colors.muted('  Configure the base branch for PRs and git comparisons'));
      console.log('');

      const branchAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'defaultBranch',
          message: 'Default base branch (for PRs, diffs, standups):',
          default: detectedDefaultBranch,
        },
        {
          type: 'confirm',
          name: 'includeDiff',
          message: 'Include code diff in AI prompt for richer PR descriptions?',
          default: true,
        },
        {
          type: 'number',
          name: 'maxDiffLines',
          message: 'Max diff lines to send to AI (to avoid token limits):',
          default: 200,
          when: (answers: Record<string, unknown>) => Boolean(answers.includeDiff),
        },
      ]);

      const configManager = ConfigManager.getInstance();
      const prConfig = {
        pr: {
          defaultBase: branchAnswers.defaultBranch,
          includeDiff: branchAnswers.includeDiff,
          maxDiffLines: branchAnswers.maxDiffLines || 200,
        },
        git: {
          defaultBranch: branchAnswers.defaultBranch,
        },
      } as Parameters<typeof configManager.update>[0];

      if (options.global) {
        configManager.update(prConfig);
        configManager.saveGlobal();
      } else {
        configManager.saveLocal(prConfig as Parameters<typeof configManager.saveLocal>[0]);
      }

      console.log(
        UI.success(`Default branch set to ${colors.accent(branchAnswers.defaultBranch)}`)
      );
      tasks.push({ name: 'Branch & PR settings', done: true, skipped: false });
    }

    // PR description prompt file
    if (options.pr_prompt) {
      console.log('');
      console.log(UI.divider());
      console.log('');
      console.log(colors.bold('📝 PR Description Prompt'));
      console.log(
        colors.muted(
          '  Create a .devdaily-pr-prompt.md file to customize how AI generates PR descriptions'
        )
      );
      console.log(
        colors.muted('  Think of it like CLAUDE.md — but specifically for PR descriptions')
      );
      console.log('');

      if (hasPRPrompt) {
        console.log(colors.muted(`  ${ASCII.status.check} PR prompt file already exists`));
        tasks.push({ name: 'PR prompt file', done: false, skipped: true });
      } else {
        const { createPrompt } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'createPrompt',
            message: 'Create a .devdaily-pr-prompt.md with sample guidelines you can customize?',
            default: true,
          },
        ]);

        if (createPrompt) {
          try {
            const repoRoot = isRepo ? await git.getRepoRoot() : process.cwd();
            const promptPath = join(repoRoot, '.devdaily-pr-prompt.md');
            writeFileSync(promptPath, generateSamplePRPrompt());
            console.log(
              UI.success(
                `Created ${colors.accent('.devdaily-pr-prompt.md')} — customize it for your team!`
              )
            );
            tasks.push({ name: 'PR prompt file', done: true, skipped: false });
          } catch {
            console.log(UI.error('Failed to create PR prompt file'));
            tasks.push({ name: 'PR prompt file', done: false, skipped: false });
          }
        } else {
          tasks.push({ name: 'PR prompt file', done: false, skipped: true });
        }
      }
    }

    // Create config (if not already done by PM setup)
    if (options.config && !options.pm) {
      try {
        const configManager = ConfigManager.getInstance();

        if (options.global) {
          configManager.saveGlobal();
          console.log(UI.success(`Created global config: ${ConfigManager.getGlobalConfigPath()}`));
        } else {
          configManager.saveLocal();
          console.log(UI.success(`Created local config: ${ConfigManager.getLocalConfigPath()}`));
        }
        tasks.push({ name: 'Config file', done: true, skipped: false });
      } catch {
        console.log(UI.error('Failed to create config'));
        tasks.push({ name: 'Config file', done: false, skipped: false });
      }
    }

    console.log('');
    console.log(UI.divider());
    console.log('');

    // Summary
    // Git hooks for automatic snapshots
    if (options.git_hooks || options.gitHooks) {
      console.log('');
      console.log(UI.divider());
      console.log('');
      console.log(colors.bold('📸 Git Hooks for Automatic Snapshots'));
      console.log(
        colors.muted(
          '  Install hooks that automatically capture your work state on commit and branch switch'
        )
      );
      console.log(
        colors.muted('  Snapshots are lightweight, local-only, and run in the background')
      );
      console.log('');

      if (!isRepo) {
        console.log(UI.warning('Not a git repository — skipping git hooks'));
        tasks.push({ name: 'Git hooks', done: false, skipped: true });
      } else {
        const { hookChoices } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'hookChoices',
            message: 'Which hooks would you like to install?',
            choices: [
              {
                name: `post-commit — snapshot after each commit`,
                value: 'post-commit',
                checked: true,
              },
              {
                name: `post-checkout — snapshot when switching branches`,
                value: 'post-checkout',
                checked: true,
              },
            ],
          },
        ]);

        if (hookChoices.length === 0) {
          console.log(colors.muted('  No hooks selected'));
          tasks.push({ name: 'Git hooks', done: false, skipped: true });
        } else {
          const hookResult = await installGitHooks({
            postCommit: hookChoices.includes('post-commit'),
            postCheckout: hookChoices.includes('post-checkout'),
          });

          if (hookResult.installed.length > 0) {
            for (const name of hookResult.installed) {
              console.log(UI.success(`Installed: ${name}`));
            }

            // Update config to reflect git hooks are enabled
            try {
              const configManager = ConfigManager.getInstance();
              const currentConfig = configManager.get();
              configManager.update({
                ...currentConfig,
                journal: {
                  ...currentConfig.journal,
                  autoSnapshot: true,
                  gitHooks: true,
                  hooks: {
                    postCommit: hookChoices.includes('post-commit'),
                    postCheckout: hookChoices.includes('post-checkout'),
                  },
                },
              });
              if (options.global) {
                configManager.saveGlobal();
              } else {
                configManager.saveLocal();
              }
            } catch {
              // Non-fatal — hooks are installed even if config update fails
            }

            tasks.push({ name: 'Git hooks', done: true, skipped: false });
          }

          for (const name of hookResult.skipped) {
            console.log(colors.muted(`  ${ASCII.status.check} ${name}`));
          }

          for (const w of hookResult.warnings) {
            console.log(UI.warning(w));
          }
        }
      }
    }

    const completed = tasks.filter((t) => t.done).length;
    const skipped = tasks.filter((t) => t.skipped).length;

    if (completed > 0) {
      console.log(UI.success(`Setup complete! (${completed} task${completed > 1 ? 's' : ''})`));
      console.log('');
      console.log(colors.muted('To apply changes, restart your terminal or run:'));
      console.log(
        `  ${colors.primary(`source ~/${shell === 'fish' ? '.config/fish/config.fish' : `.${shell}rc`}`)}`
      );
    } else if (skipped === tasks.length) {
      console.log(UI.info('Everything is already set up!'));
    }

    console.log('');
    console.log(colors.muted('Quick start:'));
    console.log(`  ${colors.primary('dd standup')}    ${colors.muted('# Generate standup notes')}`);
    console.log(
      `  ${colors.primary('dd pr')}         ${colors.muted('# Generate PR description')}`
    );
    console.log(
      `  ${colors.primary('dd dash')}       ${colors.muted('# Open interactive dashboard')}`
    );
    console.log(
      `  ${colors.primary('dd context')}    ${colors.muted('# Resume where you left off')}`
    );
    console.log('');
  });
