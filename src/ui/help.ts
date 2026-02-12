import { UI } from './renderer.js';
import { ASCII } from './ascii.js';
import { getConfig } from '../config/index.js';

const { colors } = UI;

interface CommandDef {
  name: string;
  aliases: string[];
  description: string;
  icon: string;
  options: Array<{
    flag: string;
    short?: string;
    description: string;
    default?: string;
  }>;
  examples: string[];
}

const COMMANDS: CommandDef[] = [
  {
    name: 'standup',
    aliases: ['s', 'su', 'daily'],
    description: 'Generate standup notes from your recent commits',
    icon: ASCII.icons.standup,
    options: [
      { flag: '--days', short: '-d', description: 'Number of days to look back', default: '1' },
      {
        flag: '--format',
        short: '-f',
        description: 'Output format (markdown|slack|plain|json)',
        default: 'markdown',
      },
      { flag: '--ticket', short: '-t', description: 'Include specific ticket for context' },
      { flag: '--no-tickets', description: 'Skip fetching ticket context' },
      { flag: '--no-copy', description: 'Do not copy to clipboard' },
      { flag: '--author', short: '-a', description: 'Filter by author email' },
    ],
    examples: [
      'devdaily standup',
      'devdaily s -d 3',
      'devdaily standup --ticket=PROJ-123',
      'dd s # using alias',
    ],
  },
  {
    name: 'pr',
    aliases: ['p', 'pull'],
    description: 'Generate PR description from current branch',
    icon: ASCII.icons.pr,
    options: [
      {
        flag: '--base',
        short: '-b',
        description: 'Base branch to compare against',
        default: 'main',
      },
      { flag: '--create', short: '-c', description: 'Create PR on GitHub immediately' },
      { flag: '--draft', short: '-d', description: 'Create as draft PR' },
      { flag: '--ticket', short: '-t', description: 'Include specific ticket for context' },
      { flag: '--no-tickets', description: 'Skip fetching ticket context' },
      { flag: '--no-copy', description: 'Do not copy to clipboard' },
    ],
    examples: [
      'devdaily pr',
      'devdaily p --base=develop',
      'devdaily pr --ticket=PROJ-123',
      'devdaily pr -c -d # create draft PR',
    ],
  },
  {
    name: 'week',
    aliases: ['w', 'weekly'],
    description: 'Generate weekly work summary',
    icon: ASCII.icons.week,
    options: [
      { flag: '--last', short: '-l', description: 'Show last week instead of current week' },
      { flag: '--start', short: '-s', description: 'Custom start date (YYYY-MM-DD)' },
      { flag: '--no-tickets', description: 'Skip fetching closed tickets' },
      { flag: '--no-copy', description: 'Do not copy to clipboard' },
    ],
    examples: ['devdaily week', 'devdaily w --last', 'devdaily week --start=2026-02-01'],
  },
  {
    name: 'dash',
    aliases: ['d', 'dashboard'],
    description: 'Open interactive dashboard',
    icon: ASCII.icons.dash,
    options: [],
    examples: ['devdaily dash', 'devdaily d', 'dd # with alias'],
  },
  {
    name: 'init',
    aliases: [],
    description: 'Set up DevDaily (aliases, shell completions)',
    icon: ASCII.icons.init,
    options: [
      { flag: '--global', short: '-g', description: 'Install globally for all projects' },
      { flag: '--alias', description: 'Only set up shell alias (dd)' },
      { flag: '--completions', description: 'Only set up shell completions' },
    ],
    examples: ['devdaily init', 'devdaily init --global', 'devdaily init --alias'],
  },
  {
    name: 'config',
    aliases: ['cfg'],
    description: 'Manage configuration',
    icon: ASCII.icons.config,
    options: [
      { flag: '--edit', short: '-e', description: 'Open config in editor' },
      { flag: '--reset', description: 'Reset to defaults' },
      { flag: '--path', description: 'Show config file path' },
    ],
    examples: ['devdaily config', 'devdaily config --edit', 'devdaily config --path'],
  },
  {
    name: 'doctor',
    aliases: ['check', 'setup'],
    description: 'Check system requirements and fix issues',
    icon: '🩺',
    options: [{ flag: '--fix', description: 'Attempt to automatically fix issues' }],
    examples: ['devdaily doctor', 'devdaily doctor --fix', 'devdaily check'],
  },
];

/**
 * Render the main help screen
 */
export const renderMainHelp = (): string => {
  const lines: string[] = [];
  const config = getConfig();

  // Header
  if (config.ascii) {
    lines.push(colors.gradient(ASCII.logoSmall.trim(), ['cyan', 'blue', 'magenta']));
  } else {
    lines.push(colors.gradient('◆ devdaily', ['cyan', 'blue']));
  }
  lines.push('');
  lines.push(colors.muted('  Your AI-powered developer memory'));
  lines.push(colors.muted('  Auto-generate standup notes, PR descriptions, and weekly summaries'));
  lines.push('');

  // Usage
  lines.push(colors.bold('USAGE'));
  lines.push('');
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('devdaily')} ${colors.accent('<command>')} ${colors.muted('[options]')}`
  );
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('dd')} ${colors.accent('<command>')} ${colors.muted('[options]')}  ${colors.muted('# with alias')}`
  );
  lines.push('');

  // Commands
  lines.push(colors.bold('COMMANDS'));
  lines.push('');

  COMMANDS.forEach((cmd) => {
    const aliases = cmd.aliases.length > 0 ? colors.muted(` (${cmd.aliases.join(', ')})`) : '';
    const icon = colors.accent(cmd.icon);
    const name = colors.primary(cmd.name.padEnd(12));
    lines.push(`  ${icon} ${name}${cmd.description}${aliases}`);
  });

  lines.push('');

  // Quick start
  lines.push(colors.bold('QUICK START'));
  lines.push('');
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('devdaily init')}         ${colors.muted('# Set up aliases & completions')}`
  );
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('devdaily standup')}      ${colors.muted("# Generate today's standup")}`
  );
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('devdaily pr')}           ${colors.muted('# Generate PR description')}`
  );
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('devdaily dash')}         ${colors.muted('# Open interactive dashboard')}`
  );
  lines.push('');

  // Shortcuts hint
  lines.push(colors.bold('SHORTCUTS'));
  lines.push('');
  lines.push(
    `  ${colors.accent('[q]')} quit  ${colors.accent('[?]')} help  ${colors.accent('[r]')} refresh  ${colors.accent('[c]')} copy  ${colors.accent('[↵]')} select`
  );
  lines.push('');

  // Footer
  lines.push(colors.muted('─'.repeat(60)));
  lines.push('');
  lines.push(
    `  ${colors.muted('Run')} ${colors.primary('devdaily <command> --help')} ${colors.muted('for detailed command help')}`
  );
  lines.push(
    `  ${colors.muted('Docs:')} ${colors.accent.underline('https://github.com/hempun10/devdaily')}`
  );
  lines.push('');

  return lines.join('\n');
};

/**
 * Render help for a specific command
 */
export const renderCommandHelp = (commandName: string): string | null => {
  const cmd = COMMANDS.find((c) => c.name === commandName || c.aliases.includes(commandName));

  if (!cmd) {
    return null;
  }

  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${colors.accent(cmd.icon)} ${colors.bold(colors.primary(cmd.name))}`);
  lines.push(colors.muted(cmd.description));
  lines.push('');

  // Aliases
  if (cmd.aliases.length > 0) {
    lines.push(colors.bold('ALIASES'));
    lines.push('');
    lines.push(`  ${cmd.aliases.map((a) => colors.accent(a)).join(', ')}`);
    lines.push('');
  }

  // Usage
  lines.push(colors.bold('USAGE'));
  lines.push('');
  lines.push(
    `  ${colors.muted('$')} ${colors.primary('devdaily')} ${colors.accent(cmd.name)} ${colors.muted('[options]')}`
  );
  lines.push('');

  // Options
  if (cmd.options.length > 0) {
    lines.push(colors.bold('OPTIONS'));
    lines.push('');

    cmd.options.forEach((opt) => {
      const shortStr = opt.short ? `${colors.accent(opt.short)}, ` : '    ';
      const flagStr = colors.accent(opt.flag.padEnd(16));
      const defaultStr = opt.default ? colors.muted(` [default: ${opt.default}]`) : '';
      lines.push(`  ${shortStr}${flagStr} ${opt.description}${defaultStr}`);
    });
    lines.push('');
  }

  // Examples
  if (cmd.examples.length > 0) {
    lines.push(colors.bold('EXAMPLES'));
    lines.push('');
    cmd.examples.forEach((ex) => {
      lines.push(`  ${colors.muted('$')} ${colors.primary(ex)}`);
    });
    lines.push('');
  }

  return lines.join('\n');
};

/**
 * Get all command names and aliases for validation
 */
export const getAllCommandNames = (): string[] => {
  return COMMANDS.flatMap((cmd) => [cmd.name, ...cmd.aliases]);
};

/**
 * Get command definition
 */
export const getCommand = (name: string): CommandDef | undefined => {
  return COMMANDS.find((c) => c.name === name || c.aliases.includes(name));
};

export { COMMANDS };
