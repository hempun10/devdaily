#!/usr/bin/env node
import { Command } from 'commander';
import { standupCommand } from './commands/standup.js';
import { prCommand } from './commands/pr.js';
import { weekCommand } from './commands/week.js';
import { contextCommand } from './commands/context.js';

const program = new Command();

program
  .name('devdaily')
  .description('Your AI memory for developer work')
  .version('1.0.0');

// Register commands
program.addCommand(standupCommand);
program.addCommand(prCommand);
program.addCommand(weekCommand);
program.addCommand(contextCommand);

// Parse and execute
program.parse();
