// ASCII Art and Symbols for DevDaily
// Clean, modern aesthetic

export const ASCII = {
  // Main logo - compact and modern
  logo: `
  ██████╗ ███████╗██╗   ██╗██████╗  █████╗ ██╗██╗  ██╗   ██╗
  ██╔══██╗██╔════╝██║   ██║██╔══██╗██╔══██╗██║██║  ╚██╗ ██╔╝
  ██║  ██║█████╗  ██║   ██║██║  ██║███████║██║██║   ╚████╔╝ 
  ██║  ██║██╔══╝  ╚██╗ ██╔╝██║  ██║██╔══██║██║██║    ╚██╔╝  
  ██████╔╝███████╗ ╚████╔╝ ██████╔╝██║  ██║██║███████╗██║   
  ╚═════╝ ╚══════╝  ╚═══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝   
`,

  // Smaller logo for compact displays
  logoSmall: `
   ╔═══════════════════════════════╗
   ║      D E V D A I L Y . A I    ║
   ╚═══════════════════════════════╝
`,

  // Minimal logo
  logoMini: `◆ devdaily`,

  // Command icons
  icons: {
    standup: '◈',
    pr: '◉',
    week: '◎',
    dash: '◐',
    config: '◇',
    init: '◆',
    help: '?',
  },

  // Status symbols
  status: {
    success: '✓',
    error: '✗',
    warning: '!',
    info: 'i',
    pending: '○',
    active: '●',
    arrow: '→',
    arrowRight: '▶',
    arrowDown: '▼',
    bullet: '•',
    dot: '·',
    star: '★',
    check: '✔',
    cross: '✖',
  },

  // Box drawing characters
  box: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
  },

  // Progress indicators
  progress: {
    filled: '█',
    empty: '░',
    half: '▒',
  },

  // Spinners frames
  spinners: {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    line: ['|', '/', '-', '\\'],
    arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
    circle: ['◐', '◓', '◑', '◒'],
    square: ['◰', '◳', '◲', '◱'],
  },

  // Decorative elements
  decorations: {
    wave: '～～～～～',
    sparkle: '✦',
    diamond: '◇',
    heart: '♥',
    thunder: '⚡',
  },
};

// Box drawing helper
export const drawBox = (
  content: string,
  options: {
    title?: string;
    width?: number;
    padding?: number;
    style?: 'single' | 'double' | 'round';
  } = {}
): string => {
  const { title, width = 60, padding = 1, style = 'round' } = options;

  const chars =
    style === 'round'
      ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
      : style === 'double'
        ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }
        : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };

  const lines = content.split('\n');
  const maxLineLength = Math.max(...lines.map((l) => stripAnsi(l).length));
  const innerWidth = Math.max(width - 2, maxLineLength + padding * 2);

  const padLine = (line: string): string => {
    const visibleLength = stripAnsi(line).length;
    const leftPad = ' '.repeat(padding);
    const rightPad = ' '.repeat(innerWidth - visibleLength - padding);
    return `${chars.v}${leftPad}${line}${rightPad}${chars.v}`;
  };

  const topBorder = title
    ? `${chars.tl}${chars.h} ${title} ${chars.h.repeat(innerWidth - title.length - 3)}${chars.tr}`
    : `${chars.tl}${chars.h.repeat(innerWidth)}${chars.tr}`;

  const bottomBorder = `${chars.bl}${chars.h.repeat(innerWidth)}${chars.br}`;

  const paddedContent = [
    ...Array(padding).fill(`${chars.v}${' '.repeat(innerWidth)}${chars.v}`),
    ...lines.map(padLine),
    ...Array(padding).fill(`${chars.v}${' '.repeat(innerWidth)}${chars.v}`),
  ];

  return [topBorder, ...paddedContent, bottomBorder].join('\n');
};

// Strip ANSI codes for length calculation
const stripAnsi = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
};

// Create a horizontal divider
export const divider = (width: number = 50, char: string = '─'): string => {
  return char.repeat(width);
};

// Create a progress bar
export const progressBar = (
  progress: number,
  width: number = 30,
  options: { filled?: string; empty?: string; showPercent?: boolean } = {}
): string => {
  const {
    filled = ASCII.progress.filled,
    empty = ASCII.progress.empty,
    showPercent = true,
  } = options;

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const filledCount = Math.round(clampedProgress * width);
  const emptyCount = width - filledCount;

  const bar = filled.repeat(filledCount) + empty.repeat(emptyCount);
  const percent = showPercent ? ` ${Math.round(clampedProgress * 100)}%` : '';

  return `[${bar}]${percent}`;
};

// Create a table
export const table = (
  headers: string[],
  rows: string[][],
  options: { columnWidth?: number; headerStyle?: (s: string) => string } = {}
): string => {
  const { columnWidth = 15, headerStyle = (s: string) => s } = options;

  const formatCell = (cell: string, width: number): string => {
    const visibleLength = stripAnsi(cell).length;
    if (visibleLength >= width) {
      return cell.slice(0, width - 1) + '…';
    }
    return cell + ' '.repeat(width - visibleLength);
  };

  const headerRow = headers.map((h) => headerStyle(formatCell(h, columnWidth))).join(' │ ');

  const separator = headers.map(() => '─'.repeat(columnWidth)).join('─┼─');

  const dataRows = rows
    .map((row) => row.map((cell) => formatCell(cell, columnWidth)).join(' │ '))
    .join('\n');

  return `${headerRow}\n${separator}\n${dataRows}`;
};
