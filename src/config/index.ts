import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { Config, ConfigSchema } from './schema.js';

// Config file names
const LOCAL_CONFIG_FILENAME = '.devdaily.json';
const LOCAL_SECRETS_FILENAME = '.devdaily.secrets.json';
const GLOBAL_CONFIG_DIR = join(homedir(), '.config', 'devdaily');
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, 'config.json');
const GLOBAL_SECRETS_PATH = join(GLOBAL_CONFIG_DIR, 'secrets.json');

// Secrets interface (API tokens, emails, etc.)
export interface Secrets {
  jira?: {
    email?: string;
    apiToken?: string;
    baseUrl?: string;
  };
  linear?: {
    apiKey?: string;
  };
  notion?: {
    apiKey?: string;
    databaseId?: string;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private secrets: Secrets;
  private configPath: string;

  private constructor() {
    this.secrets = this.loadSecrets();
    this.config = this.loadConfig();
    this.configPath = this.findConfigPath();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private findConfigPath(): string {
    // 1. Check local .devdaily.json
    const localConfig = join(process.cwd(), LOCAL_CONFIG_FILENAME);
    if (existsSync(localConfig)) {
      return localConfig;
    }

    // 2. Check global config
    if (existsSync(GLOBAL_CONFIG_PATH)) {
      return GLOBAL_CONFIG_PATH;
    }

    // 3. Default to local (will be created on save)
    return localConfig;
  }

  private loadSecrets(): Secrets {
    const secrets: Secrets = {};

    // Load global secrets first
    if (existsSync(GLOBAL_SECRETS_PATH)) {
      try {
        const content = readFileSync(GLOBAL_SECRETS_PATH, 'utf-8');
        Object.assign(secrets, JSON.parse(content));
      } catch {
        // Invalid secrets file
      }
    }

    // Override with local secrets
    const localSecrets = join(process.cwd(), LOCAL_SECRETS_FILENAME);
    if (existsSync(localSecrets)) {
      try {
        const content = readFileSync(localSecrets, 'utf-8');
        const local = JSON.parse(content);
        // Deep merge
        if (local.jira) secrets.jira = { ...secrets.jira, ...local.jira };
        if (local.linear) secrets.linear = { ...secrets.linear, ...local.linear };
        if (local.notion) secrets.notion = { ...secrets.notion, ...local.notion };
      } catch {
        // Invalid secrets file
      }
    }

    // Also check environment variables as fallback
    if (process.env.JIRA_EMAIL || process.env.JIRA_API_TOKEN || process.env.JIRA_BASE_URL) {
      secrets.jira = {
        ...secrets.jira,
        email: process.env.JIRA_EMAIL || secrets.jira?.email,
        apiToken: process.env.JIRA_API_TOKEN || secrets.jira?.apiToken,
        baseUrl: process.env.JIRA_BASE_URL || secrets.jira?.baseUrl,
      };
    }

    if (process.env.LINEAR_API_KEY) {
      secrets.linear = {
        ...secrets.linear,
        apiKey: process.env.LINEAR_API_KEY || secrets.linear?.apiKey,
      };
    }

    if (process.env.NOTION_API_KEY || process.env.NOTION_DATABASE_ID) {
      secrets.notion = {
        ...secrets.notion,
        apiKey: process.env.NOTION_API_KEY || secrets.notion?.apiKey,
        databaseId: process.env.NOTION_DATABASE_ID || secrets.notion?.databaseId,
      };
    }

    return secrets;
  }

  private loadConfig(): Config {
    let globalConfig: Partial<Config> = {};
    let localConfig: Partial<Config> = {};

    // Load global config first
    if (existsSync(GLOBAL_CONFIG_PATH)) {
      try {
        const content = readFileSync(GLOBAL_CONFIG_PATH, 'utf-8');
        globalConfig = JSON.parse(content);
      } catch {
        // Invalid config
      }
    }

    // Load local config (overrides global)
    const localConfigPath = join(process.cwd(), LOCAL_CONFIG_FILENAME);
    if (existsSync(localConfigPath)) {
      try {
        const content = readFileSync(localConfigPath, 'utf-8');
        localConfig = JSON.parse(content);
      } catch {
        // Invalid config
      }
    }

    // Merge: global defaults < global config < local config
    const merged = this.deepMerge(globalConfig, localConfig);

    return ConfigSchema.parse(merged);
  }

  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object'
      ) {
        result[key] = this.deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  get(): Config {
    return this.config;
  }

  getSecrets(): Secrets {
    return this.secrets;
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    this.config[key] = value;
    this.save();
  }

  update(partial: Partial<Config>): void {
    this.config = ConfigSchema.parse({ ...this.config, ...partial });
    this.save();
  }

  private save(): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  saveGlobal(): void {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }
    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  saveLocal(config?: Partial<Config>): void {
    const localPath = join(process.cwd(), LOCAL_CONFIG_FILENAME);
    const toSave = config ? ConfigSchema.parse({ ...this.config, ...config }) : this.config;
    writeFileSync(localPath, JSON.stringify(toSave, null, 2));
  }

  saveSecrets(secrets: Secrets, global = false): void {
    if (global) {
      if (!existsSync(GLOBAL_CONFIG_DIR)) {
        mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
      }
      writeFileSync(GLOBAL_SECRETS_PATH, JSON.stringify(secrets, null, 2));
    } else {
      const localPath = join(process.cwd(), LOCAL_SECRETS_FILENAME);
      writeFileSync(localPath, JSON.stringify(secrets, null, 2));
    }

    // Merge into current secrets
    this.secrets = { ...this.secrets, ...secrets };
  }

  /**
   * Add secrets file to .gitignore
   */
  addSecretsToGitignore(): boolean {
    const gitignorePath = join(process.cwd(), '.gitignore');
    const secretsEntry = LOCAL_SECRETS_FILENAME;

    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      if (content.includes(secretsEntry)) {
        return false; // Already in gitignore
      }
      appendFileSync(gitignorePath, `\n# DevDaily secrets (API tokens)\n${secretsEntry}\n`);
    } else {
      writeFileSync(gitignorePath, `# DevDaily secrets (API tokens)\n${secretsEntry}\n`);
    }

    return true;
  }

  reset(): void {
    this.config = ConfigSchema.parse({});
    this.save();
  }

  getConfigPath(): string {
    return this.configPath;
  }

  isUsingLocalConfig(): boolean {
    return this.configPath === join(process.cwd(), LOCAL_CONFIG_FILENAME);
  }

  static getGlobalConfigPath(): string {
    return GLOBAL_CONFIG_PATH;
  }

  static getLocalConfigPath(): string {
    return join(process.cwd(), LOCAL_CONFIG_FILENAME);
  }

  static getLocalSecretsPath(): string {
    return join(process.cwd(), LOCAL_SECRETS_FILENAME);
  }
}

// Export singleton getter
export const getConfig = () => ConfigManager.getInstance().get();
export const getSecrets = () => ConfigManager.getInstance().getSecrets();
export const config = ConfigManager.getInstance();
