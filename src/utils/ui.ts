import chalk from 'chalk';
import boxen from 'boxen';

// Clean, minimal UI inspired by terminal.shop
// No emojis, professional output

export class UI {
  static readonly colors = {
    primary: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    dim: chalk.gray,
    bold: chalk.bold,
  };

  static header(title: string): string {
    return this.colors.bold(title);
  }

  static section(title: string, content: string): string {
    return `\n${this.colors.primary(title)}\n${content}`;
  }

  static box(content: string, title?: string): string {
    return boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'blue',
      title: title,
      titleAlignment: 'left',
    });
  }

  static list(items: string[]): string {
    return items.map((item) => `  ${this.colors.dim('>')} ${item}`).join('\n');
  }

  static success(message: string): string {
    return this.colors.success(`✓ ${message}`);
  }

  static error(message: string): string {
    return this.colors.error(`✗ ${message}`);
  }

  static warning(message: string): string {
    return this.colors.warning(`! ${message}`);
  }

  static info(message: string): string {
    return this.colors.dim(`i ${message}`);
  }

  static divider(): string {
    return this.colors.dim('─'.repeat(50));
  }

  static dim(text: string): string {
    return this.colors.dim(text);
  }

  static table(headers: string[], rows: string[][]): string {
    const colWidths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map((r) => r[i]?.length || 0));
      return Math.max(h.length, maxRowWidth);
    });

    const headerRow = headers
      .map((h, i) => h.padEnd(colWidths[i]))
      .join('  ');
    
    const separator = colWidths
      .map((w) => '─'.repeat(w))
      .join('  ');
    
    const dataRows = rows
      .map((row) =>
        row.map((cell, i) => cell.padEnd(colWidths[i])).join('  ')
      )
      .join('\n');

    return `${this.colors.bold(headerRow)}\n${this.colors.dim(separator)}\n${dataRows}`;
  }

  static progress(current: number, total: number, label: string): string {
    const percentage = Math.round((current / total) * 100);
    const barLength = 30;
    const filled = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    
    return `${label} ${this.colors.primary(bar)} ${percentage}%`;
  }
}
