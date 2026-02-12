import boxen from 'boxen';
import ora, { Ora } from 'ora';
import { colors, chalk } from './colors.js';
import { ASCII, drawBox, divider, progressBar, table } from './ascii.js';
import { getConfig } from '../config/index.js';

// Terminal width helper
const getTerminalWidth = (): number => {
  return process.stdout.columns || 80;
};

/**
 * Render the DevDaily header/banner
 */
export const renderHeader = (subtitle?: string): string => {
  const config = getConfig();

  if (!config.ascii) {
    return colors.gradient('◆ devdaily') + (subtitle ? colors.muted(` ${subtitle}`) : '');
  }

  if (config.compactMode) {
    return colors.gradient(ASCII.logoMini) + (subtitle ? colors.muted(` · ${subtitle}`) : '');
  }

  const logo = colors.gradient(ASCII.logoSmall.trim(), ['cyan', 'blue']);
  const sub = subtitle ? `\n${colors.muted(subtitle)}` : '';

  return `${logo}${sub}`;
};

/**
 * Render a section header
 */
export const renderSection = (title: string, icon?: string): string => {
  const iconStr = icon ? `${icon} ` : '';
  return `\n${colors.primary.bold(`${iconStr}${title}`)}\n${colors.muted(divider(40))}`;
};

/**
 * Render a success message
 */
export const renderSuccess = (message: string): string => {
  return colors.success(`${ASCII.status.success} ${message}`);
};

/**
 * Render an error message
 */
export const renderError = (message: string, detail?: string): string => {
  const main = colors.error(`${ASCII.status.error} ${message}`);
  const detailStr = detail ? `\n  ${colors.muted(detail)}` : '';
  return main + detailStr;
};

/**
 * Render a warning message
 */
export const renderWarning = (message: string): string => {
  return colors.warning(`${ASCII.status.warning} ${message}`);
};

/**
 * Render an info message
 */
export const renderInfo = (message: string): string => {
  return colors.muted(`${ASCII.status.info} ${message}`);
};

/**
 * Render a boxed content area
 */
export const renderBox = (
  content: string,
  title?: string,
  options: { style?: 'round' | 'single' | 'double' } = {}
): string => {
  const width = Math.min(getTerminalWidth() - 4, 70);

  return boxen(content, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: options.style || 'round',
    borderColor: 'blue',
    title: title,
    titleAlignment: 'left',
    width,
  });
};

/**
 * Render a key-value pair
 */
export const renderKeyValue = (key: string, value: string, keyWidth: number = 15): string => {
  const paddedKey = key.padEnd(keyWidth);
  return `${colors.muted(paddedKey)} ${value}`;
};

/**
 * Render a list of items
 */
export const renderList = (
  items: string[],
  options: { bullet?: string; indent?: number } = {}
): string => {
  const { bullet = ASCII.status.bullet, indent = 2 } = options;
  const indentStr = ' '.repeat(indent);
  return items.map((item) => `${indentStr}${colors.accent(bullet)} ${item}`).join('\n');
};

/**
 * Render a numbered list
 */
export const renderNumberedList = (items: string[], options: { indent?: number } = {}): string => {
  const { indent = 2 } = options;
  const indentStr = ' '.repeat(indent);
  return items.map((item, i) => `${indentStr}${colors.accent(`${i + 1}.`)} ${item}`).join('\n');
};

/**
 * Render stats/metrics
 */
export const renderStats = (
  stats: Array<{ label: string; value: string | number; color?: string }>
): string => {
  return stats
    .map(({ label, value, color }) => {
      const colorFn = color
        ? (chalk as unknown as Record<string, (s: string) => string>)[color] || colors.primary
        : colors.primary;
      return `${colorFn(String(value))} ${colors.muted(label)}`;
    })
    .join(colors.muted(' · '));
};

/**
 * Render a progress indicator
 */
export const renderProgress = (progress: number, label?: string): string => {
  const bar = progressBar(progress, 30);
  const labelStr = label ? `${colors.muted(label)} ` : '';
  return `${labelStr}${colors.primary(bar)}`;
};

/**
 * Render a table
 */
export const renderTable = (headers: string[], rows: string[][]): string => {
  return table(headers, rows, {
    columnWidth: 20,
    headerStyle: (s) => colors.bold(s),
  });
};

/**
 * Render command help
 */
export const renderCommandHelp = (
  command: string,
  description: string,
  options: Array<{ flag: string; description: string; default?: string }>,
  examples: string[]
): string => {
  const sections: string[] = [];

  // Command header
  sections.push(colors.bold(colors.primary(`${command}`)) + colors.muted(` - ${description}`));
  sections.push('');

  // Options
  if (options.length > 0) {
    sections.push(colors.bold('OPTIONS'));
    sections.push('');
    options.forEach(({ flag, description, default: defaultVal }) => {
      const defaultStr = defaultVal ? colors.muted(` (default: ${defaultVal})`) : '';
      sections.push(`  ${colors.accent(flag.padEnd(20))} ${description}${defaultStr}`);
    });
    sections.push('');
  }

  // Examples
  if (examples.length > 0) {
    sections.push(colors.bold('EXAMPLES'));
    sections.push('');
    examples.forEach((ex) => {
      sections.push(`  ${colors.muted('$')} ${colors.primary(ex)}`);
    });
  }

  return sections.join('\n');
};

/**
 * Render keyboard shortcuts
 */
export const renderShortcuts = (shortcuts: Array<{ key: string; action: string }>): string => {
  const maxKeyLen = Math.max(...shortcuts.map((s) => s.key.length));

  return shortcuts
    .map(({ key, action }) => {
      const keyStr = colors.accent.bold(`[${key}]`.padEnd(maxKeyLen + 3));
      return `  ${keyStr} ${colors.muted(action)}`;
    })
    .join('\n');
};

/**
 * Create a spinner with custom styling
 */
export const createSpinner = (text: string): Ora => {
  return ora({
    text,
    spinner: 'dots',
    color: 'cyan',
  });
};

/**
 * Render a divider line
 */
export const renderDivider = (width?: number): string => {
  return colors.muted(divider(width || Math.min(getTerminalWidth() - 10, 60)));
};

/**
 * Clear screen and move cursor to top
 */
export const clearScreen = (): void => {
  process.stdout.write('\x1B[2J\x1B[0f');
};

/**
 * Move cursor up N lines
 */
export const cursorUp = (n: number): void => {
  process.stdout.write(`\x1B[${n}A`);
};

/**
 * Hide cursor
 */
export const hideCursor = (): void => {
  process.stdout.write('\x1B[?25l');
};

/**
 * Show cursor
 */
export const showCursor = (): void => {
  process.stdout.write('\x1B[?25h');
};

// Export everything
export const UI = {
  // Rendering
  header: renderHeader,
  section: renderSection,
  box: renderBox,
  success: renderSuccess,
  error: renderError,
  warning: renderWarning,
  info: renderInfo,
  keyValue: renderKeyValue,
  list: renderList,
  numberedList: renderNumberedList,
  stats: renderStats,
  progress: renderProgress,
  table: renderTable,
  commandHelp: renderCommandHelp,
  shortcuts: renderShortcuts,
  divider: renderDivider,

  // Utilities
  spinner: createSpinner,
  clear: clearScreen,
  cursorUp,
  hideCursor,
  showCursor,

  // Re-exports
  colors,
  chalk,
  ASCII,
  drawBox,
};

export default UI;
