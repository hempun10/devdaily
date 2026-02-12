import chalk, { ChalkInstance } from 'chalk';
import { getConfig } from '../config/index.js';
import { Theme } from '../config/schema.js';

// Dynamic theme colors based on config
const getThemeColor = (colorName: string): ChalkInstance => {
  const colorMap: Record<string, ChalkInstance> = {
    blue: chalk.blue,
    green: chalk.green,
    yellow: chalk.yellow,
    red: chalk.red,
    cyan: chalk.cyan,
    magenta: chalk.magenta,
    white: chalk.white,
    gray: chalk.gray,
    // Bright variants
    brightBlue: chalk.blueBright,
    brightGreen: chalk.greenBright,
    brightYellow: chalk.yellowBright,
    brightRed: chalk.redBright,
    brightCyan: chalk.cyanBright,
    brightMagenta: chalk.magentaBright,
  };
  return colorMap[colorName] || chalk.white;
};

export class Colors {
  private theme: Theme;

  constructor() {
    this.theme = getConfig().theme;
  }

  get primary(): ChalkInstance {
    return getThemeColor(this.theme.primary);
  }

  get success(): ChalkInstance {
    return getThemeColor(this.theme.success);
  }

  get warning(): ChalkInstance {
    return getThemeColor(this.theme.warning);
  }

  get error(): ChalkInstance {
    return getThemeColor(this.theme.error);
  }

  get accent(): ChalkInstance {
    return getThemeColor(this.theme.accent);
  }

  get muted(): ChalkInstance {
    return getThemeColor(this.theme.muted);
  }

  get bold(): ChalkInstance {
    return chalk.bold;
  }

  get dim(): ChalkInstance {
    return chalk.dim;
  }

  get italic(): ChalkInstance {
    return chalk.italic;
  }

  get underline(): ChalkInstance {
    return chalk.underline;
  }

  get inverse(): ChalkInstance {
    return chalk.inverse;
  }

  // Gradient text (for headers)
  gradient(text: string, colors: string[] = ['cyan', 'blue', 'magenta']): string {
    const chars = text.split('');
    const colorFns = colors.map((c) => getThemeColor(c));
    return chars
      .map((char, i) => {
        const colorIndex = Math.floor((i / chars.length) * colorFns.length);
        return colorFns[colorIndex](char);
      })
      .join('');
  }

  // Rainbow text
  rainbow(text: string): string {
    const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
    return text
      .split('')
      .map((char, i) => getThemeColor(colors[i % colors.length])(char))
      .join('');
  }
}

// Export singleton
export const colors = new Colors();

// Static chalk exports for simple usage
export { chalk };
