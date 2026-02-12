import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface DevDailyConfig {
  user: {
    email?: string; // Git email to filter commits
    name?: string; // Git name
  };
  timezone: string; // e.g., "Asia/Kathmandu"
  weekStart: 0 | 1 | 6; // 0=Sunday, 1=Monday, 6=Saturday
  standupTime: string; // e.g., "10:00"
  maxCommits: number; // Max commits to analyze (default 100)
  integrations: {
    slack?: {
      webhookUrl: string;
      enabled: boolean;
    };
    teams?: {
      webhookUrl: string;
      enabled: boolean;
    };
    discord?: {
      webhookUrl: string;
      enabled: boolean;
    };
  };
}

export const DEFAULT_CONFIG: DevDailyConfig = {
  user: {},
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weekStart: 0, // Sunday
  standupTime: '10:00',
  maxCommits: 100, // Max commits to analyze
  integrations: {},
};

export class ConfigManager {
  private configPath: string;
  private config: DevDailyConfig;

  constructor() {
    const configDir = join(homedir(), '.devdaily');
    this.configPath = join(configDir, 'config.json');

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Load or create config
    this.config = this.load();
  }

  private load(): DevDailyConfig {
    if (existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  }

  save(config: Partial<DevDailyConfig>): void {
    this.config = { ...this.config, ...config };
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get(): DevDailyConfig {
    return this.config;
  }

  getPath(): string {
    return this.configPath;
  }

  async autoDetectUser(): Promise<{ name: string; email: string }> {
    // Try to get from git config
    try {
      const { execa } = await import('execa');
      const { stdout: name } = await execa('git', ['config', 'user.name']);
      const { stdout: email } = await execa('git', ['config', 'user.email']);

      if (name && email) {
        this.save({
          user: { name: name.trim(), email: email.trim() },
        });
        return { name: name.trim(), email: email.trim() };
      }
    } catch {
      // Ignore errors
    }

    throw new Error('Could not detect git user. Please configure manually.');
  }
}
