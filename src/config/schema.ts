import { z } from 'zod';

// Theme configuration
export const ThemeSchema = z.object({
  primary: z.string().default('blue'),
  success: z.string().default('green'),
  warning: z.string().default('yellow'),
  error: z.string().default('red'),
  accent: z.string().default('cyan'),
  muted: z.string().default('gray'),
});

// Aliases configuration
export const AliasesSchema = z.object({
  standup: z.array(z.string()).default(['s', 'su', 'daily']),
  pr: z.array(z.string()).default(['p', 'pull']),
  week: z.array(z.string()).default(['w', 'weekly']),
  dash: z.array(z.string()).default(['d', 'dashboard']),
});

// Output defaults
export const OutputSchema = z.object({
  format: z.enum(['markdown', 'slack', 'plain', 'json']).default('markdown'),
  copyToClipboard: z.boolean().default(true),
  showStats: z.boolean().default(true),
  verbose: z.boolean().default(false),
});

// Git configuration
export const GitSchema = z.object({
  defaultBranch: z.string().default('main'),
  excludeAuthors: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default(['merge commit', 'Merge branch']),
});

// Project configuration (for multi-project support)
export const ProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  defaultBranch: z.string().optional(),
  team: z.array(z.string()).optional(),
});

// Shortcuts configuration
export const ShortcutsSchema = z.object({
  quit: z.string().default('q'),
  help: z.string().default('?'),
  refresh: z.string().default('r'),
  copy: z.string().default('c'),
  create: z.string().default('enter'),
  back: z.string().default('esc'),
  nextProject: z.string().default('tab'),
  prevProject: z.string().default('shift+tab'),
});

// Project Management Tool configuration
export const ProjectManagementSchema = z.object({
  // Which tool to use: github, jira, linear, notion, or none
  tool: z.enum(['github', 'jira', 'linear', 'notion', 'none']).default('github'),

  // Ticket/Issue prefix pattern (e.g., "PROJ", "ENG", "DEV")
  // Used to extract ticket numbers from branch names and commits
  ticketPrefix: z.string().optional(),

  // Custom regex pattern for ticket extraction (advanced)
  // Default patterns are provided for each tool
  ticketPattern: z.string().optional(),

  // Jira-specific settings
  jira: z
    .object({
      // Jira instance URL (e.g., "https://yourcompany.atlassian.net")
      baseUrl: z.string().optional(),
      // API token (stored separately for security, this is just a flag)
      // Actual token should be in JIRA_API_TOKEN env var
      useApiToken: z.boolean().default(true),
      // Default project key
      projectKey: z.string().optional(),
    })
    .default({}),

  // Linear-specific settings
  linear: z
    .object({
      // Team key (e.g., "ENG", "DEV")
      teamKey: z.string().optional(),
      // Use Linear CLI or API
      // Actual token should be in LINEAR_API_KEY env var
      useApi: z.boolean().default(true),
    })
    .default({}),

  // Notion-specific settings
  notion: z
    .object({
      // Database ID for tasks/issues
      databaseId: z.string().optional(),
      // Use Notion API
      // Actual token should be in NOTION_API_KEY env var
      useApi: z.boolean().default(true),
    })
    .default({}),
});

// Full configuration schema
export const ConfigSchema = z.object({
  // Version for config migrations
  version: z.number().default(1),

  // Display settings
  theme: ThemeSchema.default({}),
  ascii: z.boolean().default(true),
  animations: z.boolean().default(true),
  compactMode: z.boolean().default(false),

  // Command aliases
  aliases: AliasesSchema.default({}),

  // Output preferences
  output: OutputSchema.default({}),

  // Git settings
  git: GitSchema.default({}),

  // Multi-project support
  projects: z.array(ProjectSchema).default([]),
  activeProject: z.string().optional(),

  // Keyboard shortcuts
  shortcuts: ShortcutsSchema.default({}),

  // Project management integration
  projectManagement: ProjectManagementSchema.default({}),

  // Notifications (Slack/Discord webhooks)
  notifications: z
    .object({
      slack: z
        .object({
          enabled: z.boolean().default(false),
          webhookUrl: z.string().optional(),
          channel: z.string().optional(),
        })
        .default({}),
      discord: z
        .object({
          enabled: z.boolean().default(false),
          webhookUrl: z.string().optional(),
        })
        .default({}),
      // Schedule for auto-standup (e.g., "0 8 * * 1-5" = 8am weekdays)
      standupSchedule: z.string().optional(),
      standupTimezone: z.string().default('America/New_York'),
    })
    .default({}),

  // AI/Copilot settings
  copilot: z
    .object({
      timeout: z.number().default(30000),
      retries: z.number().default(2),
    })
    .default({}),

  // Standup defaults
  standup: z
    .object({
      defaultDays: z.number().default(1),
      includeWIP: z.boolean().default(false),
      template: z.string().optional(),
      sections: z
        .array(z.enum(['completed', 'in-progress', 'blockers', 'tickets', 'stats']))
        .default(['completed', 'in-progress', 'blockers']),
      groupBy: z.enum(['ticket', 'category', 'time', 'none']).default('none'),
      includeTicketLinks: z.boolean().default(true),
      scheduleTime: z.string().optional(),
      scheduleDays: z
        .array(
          z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
        )
        .default(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
    })
    .default({}),

  // PR defaults
  pr: z
    .object({
      defaultBase: z.string().default('main'),
      template: z.string().optional(),
      autoLabels: z.boolean().default(true),
      defaultLabels: z.array(z.string()).default([]),
      defaultReviewers: z.array(z.string()).default([]),
      defaultAssignees: z.array(z.string()).default([]),
      titleFormat: z.enum(['conventional', 'ticket-first', 'plain']).default('conventional'),
      includeTicketInTitle: z.boolean().default(true),
    })
    .default({}),

  // Week defaults
  week: z
    .object({
      startDay: z.enum(['sunday', 'monday']).default('monday'),
      includeWeekends: z.boolean().default(false),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Shortcuts = z.infer<typeof ShortcutsSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectManagement = z.infer<typeof ProjectManagementSchema>;
