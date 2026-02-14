import { Command } from 'commander';
import inquirer from 'inquirer';
import UI from '../ui/renderer.js';
import { ASCII } from '../ui/ascii.js';
import { getConfig, getSecrets, ConfigManager } from '../config/index.js';
import {
  getProjectManagementClient,
  extractTicketIds,
  JiraClient,
  LinearClient,
  GitHubIssueClient,
} from '../core/project-management.js';
import { type PMConnectionTestResult, type PMTool } from '../core/pm-errors.js';

const { colors } = UI;

// ─── Helper: render a connection test result ──────────────────────────────────

function renderTestResult(result: PMConnectionTestResult): void {
  const icon = result.success
    ? colors.success(ASCII.status.check)
    : colors.error(ASCII.status.cross);

  console.log(`  ${icon} ${result.message}`);

  if (result.details.responseTimeMs !== undefined) {
    console.log(
      `    ${colors.muted('Response time:')} ${colors.accent(`${result.details.responseTimeMs}ms`)}`
    );
  }

  if (!result.success && result.error) {
    console.log(`    ${colors.muted('Hint:')} ${colors.warning(result.error.hint)}`);
  }
}

// ─── Helper: show credential status ───────────────────────────────────────────

function showCredentialStatus(tool: PMTool): void {
  const secrets = getSecrets();
  const config = getConfig();

  console.log('');
  console.log(UI.section('Credential Status', '🔑'));
  console.log('');

  if (tool === 'jira') {
    const baseUrl =
      secrets.jira?.baseUrl ||
      config.projectManagement.jira.baseUrl ||
      process.env.JIRA_BASE_URL ||
      '';
    const email = secrets.jira?.email || process.env.JIRA_EMAIL || '';
    const token = secrets.jira?.apiToken || process.env.JIRA_API_TOKEN || '';
    const projectKey = config.projectManagement.jira.projectKey || '';
    const prefix = config.projectManagement.ticketPrefix || '';

    showField('Base URL', baseUrl, 'JIRA_BASE_URL');
    showField('Email', email, 'JIRA_EMAIL');
    showField('API Token', token ? maskSecret(token) : '', 'JIRA_API_TOKEN');
    showField('Project Key', projectKey, '.devdaily.json → projectManagement.jira.projectKey');
    showField('Ticket Prefix', prefix, '.devdaily.json → projectManagement.ticketPrefix');
  } else if (tool === 'linear') {
    const apiKey = secrets.linear?.apiKey || process.env.LINEAR_API_KEY || '';
    const teamKey = config.projectManagement.linear.teamKey || '';
    const prefix = config.projectManagement.ticketPrefix || '';

    showField('API Key', apiKey ? maskSecret(apiKey) : '', 'LINEAR_API_KEY');
    showField('Team Key', teamKey, '.devdaily.json → projectManagement.linear.teamKey');
    showField('Ticket Prefix', prefix, '.devdaily.json → projectManagement.ticketPrefix');
  } else if (tool === 'github') {
    showField('Auth', '(managed by gh CLI)', 'gh auth login');
    const prefix = config.projectManagement.ticketPrefix || '';
    showField('Ticket Prefix', prefix, '.devdaily.json → projectManagement.ticketPrefix');
  }
}

function showField(label: string, value: string, source: string): void {
  const icon = value ? colors.success(ASCII.status.check) : colors.error(ASCII.status.cross);
  const displayValue = value || colors.muted('not set');
  console.log(`  ${icon} ${label.padEnd(16)} ${displayValue}`);
  if (!value) {
    console.log(`    ${colors.muted('Set via:')} ${colors.accent(source)}`);
  }
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••••••';
  return secret.slice(0, 4) + '••••' + secret.slice(-4);
}

// ─── Helper: fetch a sample ticket to prove it works ──────────────────────────

async function trySampleTicket(tool: PMTool): Promise<void> {
  const client = getProjectManagementClient();

  console.log('');
  console.log(UI.section('Live Ticket Test', '🎫'));
  console.log('');

  // Ask user for a ticket ID
  const config = getConfig();
  const prefix = config.projectManagement.ticketPrefix;

  let placeholder = '';
  if (tool === 'jira') placeholder = prefix ? `${prefix}-123` : 'PROJ-123';
  else if (tool === 'linear') placeholder = prefix ? `${prefix}-42` : 'ENG-42';
  else if (tool === 'github') placeholder = '#1';

  const { ticketId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'ticketId',
      message: `Enter a ticket ID to fetch (e.g. ${placeholder}):`,
      validate: (input: string) => {
        if (!input.trim()) return 'Please enter a ticket ID';
        return true;
      },
    },
  ]);

  const spinner = UI.spinner(`Fetching ${ticketId} from ${tool}...`);
  spinner.start();

  try {
    const ticket = await client.getTicket(ticketId.trim());
    spinner.stop();

    if (ticket) {
      console.log('');
      console.log(colors.success(`  ${ASCII.status.check} Ticket found!`));
      console.log('');
      console.log(`  ${colors.accent('ID:')}          ${ticket.id}`);
      console.log(`  ${colors.accent('Title:')}       ${ticket.title}`);
      console.log(`  ${colors.accent('Status:')}      ${ticket.status}`);
      console.log(`  ${colors.accent('Type:')}        ${ticket.type}`);
      if (ticket.priority) {
        console.log(`  ${colors.accent('Priority:')}    ${ticket.priority}`);
      }
      if (ticket.assignee) {
        console.log(`  ${colors.accent('Assignee:')}    ${ticket.assignee}`);
      }
      if (ticket.labels.length > 0) {
        console.log(`  ${colors.accent('Labels:')}      ${ticket.labels.join(', ')}`);
      }
      if (ticket.url) {
        console.log(`  ${colors.accent('URL:')}         ${colors.muted(ticket.url)}`);
      }

      // Show how it looks as AI context
      console.log('');
      console.log(colors.muted('  This is how DevDaily will present it to Copilot:'));
      console.log('');
      const context = client.formatTicketForContext(ticket);
      for (const line of context.split('\n')) {
        console.log(`  ${colors.muted('│')} ${line}`);
      }
    } else {
      console.log('');
      console.log(colors.warning(`  ${ASCII.status.warning} Ticket "${ticketId}" not found`));
      console.log(colors.muted(`  Make sure the ID is correct and you have access`));
    }
  } catch (err) {
    spinner.stop();
    console.log('');
    console.log(
      colors.error(`  ${ASCII.status.cross} Failed to fetch ticket: ${(err as Error).message}`)
    );
  }
}

// ─── Helper: test ticket extraction from branch/commit ────────────────────────

function testTicketExtraction(): void {
  const config = getConfig();
  const tool = config.projectManagement.tool;
  const prefix = config.projectManagement.ticketPrefix;

  console.log('');
  console.log(UI.section('Ticket Pattern Matching', '🔍'));
  console.log('');

  // Show current config
  console.log(`  ${colors.accent('Tool:')}     ${tool}`);
  console.log(`  ${colors.accent('Prefix:')}   ${prefix || colors.muted('(none)')}`);
  console.log('');

  // Test against common patterns
  interface PatternTest {
    input: string;
    label: string;
  }

  const testCases: PatternTest[] = [];

  if (tool === 'jira' || tool === 'linear') {
    const p = prefix || 'PROJ';
    testCases.push(
      { input: `feature/${p}-123-add-login`, label: 'Branch name' },
      { input: `fix: resolve ${p}-456 validation bug`, label: 'Commit msg' },
      { input: `${p}-789/implement-oauth`, label: 'Branch name' },
      { input: `chore: update deps, refs ${p}-10 ${p}-11`, label: 'Multi-ticket' }
    );
  } else if (tool === 'github') {
    testCases.push(
      { input: 'fix/#42-button-color', label: 'Branch name' },
      { input: 'fix: resolve #123 login issue', label: 'Commit msg' },
      { input: 'feat: implements #10 and closes #11', label: 'Multi-ticket' },
      { input: 'feature/add-login-page', label: 'No ticket' }
    );
  }

  for (const tc of testCases) {
    const ids = extractTicketIds(tc.input);
    const icon =
      ids.length > 0 ? colors.success(ASCII.status.check) : colors.muted(ASCII.status.pending);
    const found = ids.length > 0 ? colors.success(ids.join(', ')) : colors.muted('(none)');

    console.log(
      `  ${icon} ${tc.label.padEnd(14)} ${colors.muted('"')}${tc.input}${colors.muted('"')}`
    );
    console.log(`    ${colors.muted('→ Extracted:')} ${found}`);
  }
}

// ─── Helper: interactive quick setup for a tool ───────────────────────────────

async function quickSetup(tool: PMTool): Promise<boolean> {
  console.log('');
  console.log(UI.section('Quick Setup', '⚙️'));
  console.log('');

  if (tool === 'jira') {
    console.log(colors.muted('  Your Jira API token can be created at:'));
    console.log(colors.accent('  https://id.atlassian.com/manage-profile/security/api-tokens'));
    console.log('');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Jira base URL:',
        default: 'https://yourcompany.atlassian.net',
        validate: (input: string) => input.startsWith('http') || 'Must be a valid URL',
      },
      {
        type: 'input',
        name: 'email',
        message: 'Your Jira email:',
        validate: (input: string) => input.includes('@') || 'Must be a valid email',
      },
      {
        type: 'password',
        name: 'apiToken',
        message: 'Jira API token:',
        mask: '*',
        validate: (input: string) => input.length > 0 || 'API token is required',
      },
      {
        type: 'input',
        name: 'projectKey',
        message: 'Default project key (optional, e.g. PROJ):',
      },
      {
        type: 'input',
        name: 'ticketPrefix',
        message: 'Ticket prefix for extraction (optional, e.g. PROJ):',
      },
    ]);

    // Save secrets
    const configManager = ConfigManager.getInstance();
    configManager.saveSecrets(
      {
        jira: {
          baseUrl: answers.baseUrl,
          email: answers.email,
          apiToken: answers.apiToken,
        },
      },
      false
    );

    // Update config
    const currentConfig = getConfig();
    configManager.saveLocal({
      ...currentConfig,
      projectManagement: {
        ...currentConfig.projectManagement,
        tool: 'jira',
        ticketPrefix: answers.ticketPrefix || currentConfig.projectManagement.ticketPrefix,
        jira: {
          ...currentConfig.projectManagement.jira,
          projectKey: answers.projectKey || undefined,
          baseUrl: answers.baseUrl,
        },
      },
    });

    // Add secrets to gitignore
    configManager.addSecretsToGitignore();

    console.log('');
    console.log(UI.success('Jira credentials saved'));
    console.log(colors.muted('  Secrets stored in .devdaily.secrets.json'));
    console.log(colors.muted('  Added to .gitignore'));
    return true;
  } else if (tool === 'linear') {
    console.log(colors.muted('  Get your API key from Linear:'));
    console.log(colors.accent('  Settings → Account → API → Personal API keys'));
    console.log('');

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Linear API key:',
        mask: '*',
        validate: (input: string) => input.length > 0 || 'API key is required',
      },
      {
        type: 'input',
        name: 'teamKey',
        message: 'Team key (optional, e.g. ENG):',
      },
      {
        type: 'input',
        name: 'ticketPrefix',
        message: 'Ticket prefix for extraction (optional, e.g. ENG):',
      },
    ]);

    // Save secrets
    const configManager = ConfigManager.getInstance();
    configManager.saveSecrets(
      {
        linear: {
          apiKey: answers.apiKey,
        },
      },
      false
    );

    // Update config
    const currentConfig = getConfig();
    configManager.saveLocal({
      ...currentConfig,
      projectManagement: {
        ...currentConfig.projectManagement,
        tool: 'linear',
        ticketPrefix: answers.ticketPrefix || currentConfig.projectManagement.ticketPrefix,
        linear: {
          ...currentConfig.projectManagement.linear,
          teamKey: answers.teamKey || undefined,
        },
      },
    });

    // Add secrets to gitignore
    configManager.addSecretsToGitignore();

    console.log('');
    console.log(UI.success('Linear credentials saved'));
    console.log(colors.muted('  Secrets stored in .devdaily.secrets.json'));
    console.log(colors.muted('  Added to .gitignore'));
    return true;
  } else if (tool === 'github') {
    console.log(colors.muted('  GitHub uses the gh CLI for authentication.'));
    console.log(colors.muted('  If you are not logged in, run: gh auth login'));
    console.log('');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'ticketPrefix',
        message: 'Ticket prefix for extraction (optional):',
      },
    ]);

    if (answers.ticketPrefix) {
      const configManager = ConfigManager.getInstance();
      const currentConfig = getConfig();
      configManager.saveLocal({
        ...currentConfig,
        projectManagement: {
          ...currentConfig.projectManagement,
          tool: 'github',
          ticketPrefix: answers.ticketPrefix,
        },
      });
    }

    console.log('');
    console.log(UI.success('GitHub configuration saved'));
    return true;
  }

  return false;
}

// ─── Main Command ─────────────────────────────────────────────────────────────

export const connectCommand = new Command('connect')
  .description('Test and configure PM tool connections (Jira, Linear, GitHub)')
  .option('--tool <tool>', 'PM tool to test (jira, linear, github)')
  .option('--test', 'Run connection test only (non-interactive)')
  .option('--setup', 'Run interactive setup for the selected tool')
  .option('--ticket <id>', 'Fetch a specific ticket to verify')
  .option('--status', 'Show current credential status only')
  .action(async (options) => {
    console.log('');
    console.log(UI.header('PM Connection Manager'));
    console.log('');

    // Determine which tool to use
    let tool: PMTool;

    if (options.tool) {
      if (!['jira', 'linear', 'github'].includes(options.tool)) {
        console.log(UI.error(`Unsupported tool: ${options.tool}. Use jira, linear, or github.`));
        process.exit(1);
      }
      tool = options.tool as PMTool;
    } else if (options.test || options.status) {
      // Use configured tool for non-interactive modes
      const config = getConfig();
      tool =
        config.projectManagement.tool === 'none'
          ? 'github'
          : (config.projectManagement.tool as PMTool);
    } else {
      // Interactive: ask user
      const { selectedTool } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedTool',
          message: 'Which PM tool do you want to connect?',
          choices: [
            {
              name: `${colors.accent('🐙')} GitHub Issues (uses gh CLI)`,
              value: 'github',
            },
            {
              name: `${colors.accent('🔷')} Jira (REST API)`,
              value: 'jira',
            },
            {
              name: `${colors.accent('📐')} Linear (GraphQL API)`,
              value: 'linear',
            },
          ],
        },
      ]);
      tool = selectedTool;
    }

    console.log(`  ${colors.accent('Tool:')} ${tool.charAt(0).toUpperCase() + tool.slice(1)}`);

    // ── Status-only mode ────────────────────────────────────────────────
    if (options.status) {
      showCredentialStatus(tool);
      console.log('');
      return;
    }

    // ── Setup mode ──────────────────────────────────────────────────────
    if (options.setup) {
      await quickSetup(tool);
      console.log('');
      return;
    }

    // ── Non-interactive test mode ───────────────────────────────────────
    if (options.test) {
      showCredentialStatus(tool);

      console.log('');
      console.log(UI.section('Connection Test', '🔌'));
      console.log('');

      const client = getProjectManagementClient();
      const result = await client.testConnection();
      renderTestResult(result);

      if (result.success) {
        testTicketExtraction();
      }

      // Fetch specific ticket if requested
      if (options.ticket && result.success) {
        const spinner = UI.spinner(`Fetching ${options.ticket} from ${tool}...`);
        spinner.start();
        try {
          const ticket = await client.getTicket(options.ticket);
          spinner.stop();
          if (ticket) {
            console.log('');
            console.log(
              colors.success(`  ${ASCII.status.check} Ticket found: [${ticket.id}] ${ticket.title}`)
            );
          } else {
            console.log('');
            console.log(
              colors.warning(`  ${ASCII.status.warning} Ticket "${options.ticket}" not found`)
            );
          }
        } catch (err) {
          spinner.stop();
          console.log(colors.error(`  ${ASCII.status.cross} Error: ${(err as Error).message}`));
        }
      }

      console.log('');
      process.exit(result.success ? 0 : 1);
    }

    // ── Full interactive mode ───────────────────────────────────────────

    // Step 1: Show credential status
    showCredentialStatus(tool);

    // Step 2: Check if setup is needed
    const missingFields =
      tool === 'github'
        ? []
        : tool === 'jira'
          ? new JiraClient().getMissingConfig()
          : new LinearClient().getMissingConfig();

    if (missingFields.length > 0) {
      console.log('');
      console.log(UI.warning(`Missing configuration: ${missingFields.join(', ')}`));

      const { wantSetup } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wantSetup',
          message: 'Would you like to set up credentials now?',
          default: true,
        },
      ]);

      if (wantSetup) {
        const didSetup = await quickSetup(tool);
        if (!didSetup) {
          console.log('');
          return;
        }
      } else {
        console.log('');
        console.log(UI.info('Skipping setup. Run `devdaily connect --setup` later.'));
        console.log('');
        return;
      }
    }

    // Step 3: Test connection
    console.log('');
    console.log(UI.section('Connection Test', '🔌'));
    console.log('');

    const spinner = UI.spinner(`Testing ${tool} connection...`);
    spinner.start();

    // Re-create client to pick up any newly saved credentials
    // ConfigManager is a singleton so we need to get a fresh client
    const freshClient =
      tool === 'jira'
        ? new JiraClient()
        : tool === 'linear'
          ? new LinearClient()
          : new GitHubIssueClient();

    const result = await freshClient.testConnection();
    spinner.stop();

    renderTestResult(result);

    if (!result.success) {
      console.log('');
      console.log(UI.info('Fix the issue above and run `devdaily connect` again.'));
      console.log('');
      return;
    }

    // Step 4: Test ticket extraction patterns
    testTicketExtraction();

    // Step 5: Offer to fetch a sample ticket
    console.log('');
    const { wantTicketTest } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantTicketTest',
        message: 'Would you like to fetch a real ticket to verify?',
        default: true,
      },
    ]);

    if (wantTicketTest) {
      await trySampleTicket(tool);
    }

    // Step 6: Summary
    console.log('');
    console.log(UI.section('Summary', '📋'));
    console.log('');
    console.log(
      `  ${colors.success(ASCII.status.check)} ${tool.charAt(0).toUpperCase() + tool.slice(1)} integration is ${colors.success('ready')}`
    );
    console.log('');
    console.log(colors.muted('  DevDaily will now:'));
    console.log(colors.muted('  • Extract ticket IDs from your branches and commits'));
    console.log(colors.muted('  • Fetch ticket details to enrich standup & PR context'));
    console.log(colors.muted('  • Pass ticket info to Copilot for smarter summaries'));
    console.log('');
    console.log(
      colors.muted('  Try it:') +
        ` ${colors.accent('devdaily standup')} or ${colors.accent('devdaily pr')}`
    );
    console.log('');
  });
