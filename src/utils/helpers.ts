import ora from 'ora';
import clipboard from 'clipboardy';
import { UI } from './ui.js';

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await clipboard.write(text);
    console.log(UI.success('Copied to clipboard'));
  } catch {
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

export function getWeekStart(weeksAgo: number = 0, weekStartDay: 0 | 1 | 6 = 0): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const start = new Date(now);
  
  // Calculate days to subtract to get to the week start day
  let daysToSubtract = (dayOfWeek - weekStartDay + 7) % 7;
  start.setDate(now.getDate() - daysToSubtract);
  start.setDate(start.getDate() - weeksAgo * 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getWeekEnd(weeksAgo: number = 0, weekStartDay: 0 | 1 | 6 = 0): Date {
  const start = getWeekStart(weeksAgo, weekStartDay);
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
