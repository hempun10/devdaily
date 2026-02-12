import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { standupCommand } from './commands/standup.js';
import { prCommand } from './commands/pr.js';
import { weekCommand } from './commands/week.js';
import { contextCommand } from './commands/context.js';
import { configCommand } from './commands/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('devdaily')
  .description('Your AI memory for developer work')
  .version(packageJson.version);

// Register commands
program.addCommand(standupCommand);
program.addCommand(prCommand);
program.addCommand(weekCommand);
program.addCommand(contextCommand);
program.addCommand(configCommand);

// Parse and execute
program.parse();
