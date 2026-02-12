import { Command } from 'commander';
import { ConfigManager } from '../core/config.js';
import { UI } from '../utils/ui.js';

export const configCommand = new Command('config')
  .description('Manage DevDaily configuration')
  .action(() => {
    configCommand.outputHelp();
  });

// Get config value
configCommand
  .command('get [key]')
  .description('Get configuration value')
  .action((key) => {
    const configManager = new ConfigManager();
    const config = configManager.get();

    if (!key) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    const keys = key.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = config;
    for (const k of keys) {
      value = value?.[k];
    }

    if (value === undefined) {
      console.log(UI.error(`Config key "${key}" not found`));
      process.exit(1);
    }

    console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
  });

// Set config value
configCommand
  .command('set <key> <value>')
  .description('Set configuration value')
  .action((key, value) => {
    const configManager = new ConfigManager();
    const config = configManager.get();

    const keys = key.split('.');
    const lastKey = keys.pop()!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let target: any = config;

    for (const k of keys) {
      if (!target[k]) target[k] = {};
      target = target[k];
    }

    // Parse value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsedValue: any = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = Number(value);

    target[lastKey] = parsedValue;
    configManager.save(config);

    console.log(UI.success(`Set ${key} = ${parsedValue}`));
  });

// Show config path
configCommand
  .command('path')
  .description('Show config file path')
  .action(() => {
    const configManager = new ConfigManager();
    console.log(configManager.getPath());
  });

// Init/setup wizard
configCommand
  .command('init')
  .description('Initialize configuration')
  .action(async () => {
    const configManager = new ConfigManager();

    console.log(UI.info('Initializing DevDaily configuration...\n'));

    try {
      // Auto-detect user
      const user = await configManager.autoDetectUser();
      console.log(UI.success(`Detected git user: ${user.name} <${user.email}>`));

      // Show current config
      const config = configManager.get();
      console.log('\n' + UI.info('Current configuration:'));
      console.log(`  Timezone: ${config.timezone}`);
      console.log(`  Week starts on: ${['Sunday', 'Monday', '', '', '', '', 'Saturday'][config.weekStart]}`);
      console.log(`  Standup time: ${config.standupTime}`);
      console.log(`\n  Config file: ${configManager.getPath()}`);
      console.log('\n' + UI.info('To customize, run: devdaily config set <key> <value>'));
      console.log('  Examples:');
      console.log('    devdaily config set timezone "Asia/Kathmandu"');
      console.log('    devdaily config set weekStart 0  # 0=Sunday, 1=Monday, 6=Saturday');
      console.log('    devdaily config set standupTime "09:30"');
    } catch (error) {
      console.log(UI.error('Failed to initialize config'));
      console.log(UI.dim((error as Error).message));
      process.exit(1);
    }
  });
