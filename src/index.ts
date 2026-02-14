import { Command } from 'commander';
import { createRequire } from 'module';
import { standupCommand } from './commands/standup.js';
import { prCommand } from './commands/pr.js';
import { weekCommand } from './commands/week.js';
import { contextCommand } from './commands/context.js';
import { snapshotCommand } from './commands/snapshot.js';
import { recallCommand } from './commands/recall.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { dashCommand } from './commands/dash.js';
import { doctorCommand } from './commands/doctor.js';
import { connectCommand } from './commands/connect.js';
import { renderMainHelp } from './ui/help.js';
import UI from './ui/renderer.js';

const { colors } = UI;

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

// Configure program
program
  .name('devdaily')
  .description('Your AI-powered developer memory')
  .version(pkg.version, '-v, --version', 'Show version number')
  .configureHelp({
    sortSubcommands: true,
    sortOptions: true,
  })
  .addHelpText('beforeAll', () => {
    return renderMainHelp();
  })
  .showHelpAfterError('Run `devdaily --help` for usage information');

// Register commands
program.addCommand(standupCommand);
program.addCommand(prCommand);
program.addCommand(weekCommand);
program.addCommand(contextCommand);
program.addCommand(snapshotCommand);
program.addCommand(recallCommand);
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(dashCommand);
program.addCommand(doctorCommand);
program.addCommand(connectCommand);

// Add aliases
standupCommand.alias('s').alias('su').alias('daily');
prCommand.alias('p').alias('pull');
weekCommand.alias('w').alias('weekly');
contextCommand.alias('ctx').alias('resume');
snapshotCommand.alias('snap').alias('save');
recallCommand.alias('search').alias('find');
doctorCommand.alias('check').alias('setup');
connectCommand.alias('pm').alias('link');

// Default action (no command) - show help
program.action(async () => {
  console.log(renderMainHelp());
});

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.unknownCommand') {
    console.log('');
    console.log(UI.error(`Unknown command`));
    console.log(UI.info('Run `devdaily --help` to see available commands'));
    process.exit(1);
  }
  // Don't throw for help - just exit cleanly
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.help') {
    process.exit(0);
  }
  throw err;
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log(UI.info('Interrupted'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.log('');
  console.log(UI.error('An unexpected error occurred'));
  console.log(colors.muted(error.message));
  process.exit(1);
});

// Parse and execute
program.parse();
