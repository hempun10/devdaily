import { Command } from 'commander';
import { startDashboard } from '../ui/dashboard.js';

export const dashCommand = new Command('dash')
  .alias('d')
  .alias('dashboard')
  .description('Open interactive dashboard')
  .action(async () => {
    await startDashboard();
  });
