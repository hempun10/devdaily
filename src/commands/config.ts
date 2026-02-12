import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager, getConfig } from '../config/index.js';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const configCommand = new Command('config')
  .description('Manage DevDaily configuration')
  .option('-e, --edit', 'Open config in editor')
  .option('--reset', 'Reset to defaults')
  .option('--path', 'Show config file path')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    const configManager = ConfigManager.getInstance();
    const config = getConfig();

    if (options.path) {
      console.log('');
      console.log(UI.keyValue('Config path', configManager.getConfigPath()));
      console.log(UI.keyValue('Global config', ConfigManager.getGlobalConfigPath()));
      console.log(UI.keyValue('Local config', ConfigManager.getLocalConfigPath()));
      console.log('');
      return;
    }

    if (options.reset) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Reset configuration to defaults?',
          default: false,
        },
      ]);

      if (confirm) {
        configManager.reset();
        console.log(UI.success('Configuration reset to defaults'));
      }
      return;
    }

    if (options.edit) {
      const editor = process.env.EDITOR || 'code';
      const configPath = configManager.getConfigPath();

      console.log(UI.info(`Opening ${configPath} in ${editor}...`));

      try {
        await execAsync(`${editor} "${configPath}"`);
      } catch {
        console.log(UI.error(`Failed to open editor. Config path: ${configPath}`));
      }
      return;
    }

    if (options.show) {
      console.log('');
      console.log(UI.section('Current Configuration', ASCII.icons.config));
      console.log('');
      console.log(JSON.stringify(config, null, 2));
      console.log('');
      return;
    }

    // Interactive configuration
    console.log('');
    console.log(UI.header('Configuration'));
    console.log('');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to configure?',
        choices: [
          { name: `${ASCII.icons.standup} Theme & Appearance`, value: 'theme' },
          { name: `${ASCII.icons.pr} Default Settings`, value: 'defaults' },
          { name: `${ASCII.icons.week} Output Preferences`, value: 'output' },
          new inquirer.Separator(),
          { name: 'Show current config', value: 'show' },
          { name: 'Open in editor', value: 'edit' },
          { name: 'Reset to defaults', value: 'reset' },
          new inquirer.Separator(),
          { name: 'Exit', value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'theme':
        await configureTheme(configManager);
        break;
      case 'defaults':
        await configureDefaults(configManager);
        break;
      case 'output':
        await configureOutput(configManager);
        break;
      case 'show':
        console.log('');
        console.log(JSON.stringify(config, null, 2));
        console.log('');
        break;
      case 'edit': {
        const editor = process.env.EDITOR || 'code';
        try {
          await execAsync(`${editor} "${configManager.getConfigPath()}"`);
        } catch {
          console.log(UI.error('Failed to open editor'));
        }
        break;
      }
      case 'reset':
        configManager.reset();
        console.log(UI.success('Configuration reset'));
        break;
    }
  });

async function configureTheme(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'primary',
      message: 'Primary color:',
      choices: ['blue', 'cyan', 'green', 'magenta', 'yellow', 'red'],
      default: config.theme.primary,
    },
    {
      type: 'confirm',
      name: 'ascii',
      message: 'Show ASCII art logo?',
      default: config.ascii,
    },
    {
      type: 'confirm',
      name: 'compactMode',
      message: 'Use compact mode?',
      default: config.compactMode,
    },
  ]);

  configManager.update({
    theme: { ...config.theme, primary: answers.primary },
    ascii: answers.ascii,
    compactMode: answers.compactMode,
  });

  console.log(UI.success('Theme updated'));
}

async function configureDefaults(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'defaultBranch',
      message: 'Default base branch for PRs:',
      default: config.pr.defaultBase,
    },
    {
      type: 'number',
      name: 'standupDays',
      message: 'Default days for standup:',
      default: config.standup.defaultDays,
    },
    {
      type: 'list',
      name: 'weekStart',
      message: 'Week starts on:',
      choices: ['monday', 'sunday'],
      default: config.week.startDay,
    },
  ]);

  configManager.update({
    pr: { ...config.pr, defaultBase: answers.defaultBranch },
    standup: { ...config.standup, defaultDays: answers.standupDays },
    week: { ...config.week, startDay: answers.weekStart },
  });

  console.log(UI.success('Defaults updated'));
}

async function configureOutput(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: 'Default output format:',
      choices: ['markdown', 'slack', 'plain', 'json'],
      default: config.output.format,
    },
    {
      type: 'confirm',
      name: 'copyToClipboard',
      message: 'Auto-copy to clipboard?',
      default: config.output.copyToClipboard,
    },
    {
      type: 'confirm',
      name: 'showStats',
      message: 'Show statistics?',
      default: config.output.showStats,
    },
  ]);

  configManager.update({
    output: {
      ...config.output,
      format: answers.format,
      copyToClipboard: answers.copyToClipboard,
      showStats: answers.showStats,
    },
  });

  console.log(UI.success('Output preferences updated'));
}
