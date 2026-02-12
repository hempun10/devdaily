import ora from 'ora';
import clipboard from 'clipboardy';
import { UI } from './ui.js';

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await clipboard.write(text);
    console.log(UI.success('Copied to clipboard'));
  } catch (error) {
    console.log(UI.warning('Failed to copy to clipboard'));
  }
}

export function spinner(text: string) {
  return ora({
    text,
    spinner: 'dots',
    color: 'blue',
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateRange(start: Date, end: Date): string {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function getWeekStart(weeksAgo: number = 0): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  monday.setDate(monday.getDate() - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekEnd(weeksAgo: number = 0): Date {
  const start = getWeekStart(weeksAgo);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}
