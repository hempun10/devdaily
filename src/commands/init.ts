import { Command } from 'commander';
import { existsSync, readFileSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import inquirer from 'inquirer';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { ConfigManager, type Secrets } from '../config/index.js';

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
  .action(async (options) => {
    console.log('');
    console.log(UI.header('DevDaily Setup'));
    console.log('');

    const shell = detectShell();
    console.log(UI.info(`Detected shell: ${shell}`));
    console.log('');

    const tasks: Array<{ name: string; done: boolean; skipped: boolean }> = [];

    // Interactive setup if no specific options
    const hasSpecificOption =
      options.alias || options.completions || options.config || options.pm || options.notifications;

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
              name: `${colors.accent('🔔')} Notifications (Slack/Discord webhooks)`,
              value: 'notifications',
              checked: false,
            },
          ],
        },
      ]);

      options.alias = features.includes('alias');
      options.completions = features.includes('completions');
      options.config = features.includes('config');
      options.pm = features.includes('pm');
      options.notifications = features.includes('notifications');
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
        const pmConfig = {
          projectManagement: {
            tool: pmTool as 'github' | 'jira' | 'linear' | 'notion',
            ticketPrefix: ticketPrefix || undefined,
          },
        };

        if (options.global) {
          configManager.update(pmConfig);
          configManager.saveGlobal();
        } else {
          configManager.saveLocal(pmConfig);
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
      const notificationConfig: Record<string, unknown> = {};

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
        // Save notification config
        const config = {
          notifications: notificationConfig,
        };

        if (options.global) {
          configManager.update(config);
          configManager.saveGlobal();
        } else {
          configManager.saveLocal(config);
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
    console.log('');
  });
