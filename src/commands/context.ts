import { Command } from 'commander';
import { UI } from '../utils/ui.js';

export const contextCommand = new Command('context')
  .description('Recover what you were working on (coming soon)')
  .action(async () => {
    console.log(UI.info('Context recovery feature coming soon!'));
    console.log(UI.dim('This will help you remember what you were working on after interruptions'));
  });
