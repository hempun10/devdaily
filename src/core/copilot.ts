import { execa } from 'execa';
import { type Ticket } from './project-management.js';
import { type WorkContext } from './context-analyzer.js';

export interface IssueContext {
  number: number;
  title: string;
  type: string; // bug, feature, etc.
  description: string;
}

export class CopilotClient {
  /**
   * Check if the new GitHub Copilot CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      // Check for the new copilot CLI first
      await execa('copilot', ['--version']);
      return true;
    } catch {
      // Fallback: check for gh copilot extension (deprecated)
      try {
        await execa('gh', ['copilot', '--version']);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Check which Copilot CLI is available
   */
  private async getCopilotType(): Promise<'new' | 'legacy' | null> {
    try {
      await execa('copilot', ['--version']);
      return 'new';
    } catch {
      try {
        await execa('gh', ['copilot', '--version']);
        return 'legacy';
      } catch {
        return null;
      }
    }
  }

  /**
   * Execute a prompt using the new Copilot CLI (non-interactive mode)
   */
  private async executeNewCopilot(prompt: string): Promise<string> {
    try {
      const { stdout } = await execa(
        'copilot',
        ['-p', prompt, '--silent', '--no-ask-user', '--model', 'claude-sonnet-4'],
        {
          timeout: 120000, // 2 minute timeout
          env: {
            ...process.env,
            NO_COLOR: '1', // Disable color output for cleaner parsing
          },
        }
      );

      return this.parseOutput(stdout);
    } catch (error) {
      throw new Error(`Copilot CLI error: ${error}`);
    }
  }

  /**
   * Execute using the legacy gh copilot extension
   */
  private async executeLegacyCopilot(prompt: string): Promise<string> {
    try {
      const { stdout } = await execa('gh', ['copilot', 'suggest', '-t', 'shell', prompt]);
      return this.parseOutput(stdout);
    } catch (error) {
      throw new Error(`Legacy Copilot CLI error: ${error}`);
    }
  }

  async suggest(prompt: string): Promise<string> {
    const copilotType = await this.getCopilotType();

    if (copilotType === 'new') {
      return this.executeNewCopilot(prompt);
    } else if (copilotType === 'legacy') {
      return this.executeLegacyCopilot(prompt);
    } else {
      throw new Error(
        'GitHub Copilot CLI is not installed. Install it with: brew install copilot-cli'
      );
    }
  }

  async explain(code: string): Promise<string> {
    const copilotType = await this.getCopilotType();

    if (copilotType === 'new') {
      return this.executeNewCopilot(`Explain this code:\n\n${code}`);
    } else if (copilotType === 'legacy') {
      try {
        const { stdout } = await execa('gh', ['copilot', 'explain', code]);
        return this.parseOutput(stdout);
      } catch (error) {
        throw new Error(`Copilot CLI error: ${error}`);
      }
    } else {
      throw new Error(
        'GitHub Copilot CLI is not installed. Install it with: brew install copilot-cli'
      );
    }
  }

  private parseOutput(raw: string): string {
    // Remove ANSI codes
    // eslint-disable-next-line no-control-regex
    const cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    // For the new Copilot CLI in silent mode, output is cleaner
    // Just trim and return
    const lines = cleaned.split('\n');
    const relevantLines = lines.filter(
      (line) =>
        line.trim() &&
        !line.includes('Suggestion:') &&
        !line.includes('Explain command:') &&
        !line.includes('?') &&
        !line.startsWith('Session:') &&
        !line.startsWith('Model:') &&
        !line.startsWith('Duration:')
    );

    return relevantLines.join('\n').trim();
  }

  /**
   * Format tickets into context string for AI
   */
  private formatTicketContext(tickets: Ticket[]): string {
    if (tickets.length === 0) return '';

    const ticketContexts = tickets.map((ticket) => {
      const description = ticket.description?.slice(0, 200) || 'No description';
      const priority = ticket.priority ? ` (${ticket.priority})` : '';

      return `  - ${ticket.id} [${ticket.type}${priority}]: ${ticket.title}\n    Context: ${description}`;
    });

    return `\nRelated Tickets/Tasks (for context on WHY these changes were made):\n${ticketContexts.join('\n')}`;
  }

  /**
   * Format work context into prompt context
   */
  private formatWorkContext(context?: WorkContext): string {
    if (!context) return '';

    const lines: string[] = ['Work Context:'];

    if (context.tickets.length > 0) {
      lines.push(`  Tickets: ${context.tickets.map((t) => t.id).join(', ')}`);
    }

    if (context.categories.length > 0) {
      const cats = context.categories.slice(0, 3).map((c) => `${c.name} (${c.percentage}%)`);
      lines.push(`  Work areas: ${cats.join(', ')}`);
    }

    lines.push(`  Files changed: ${context.filesChanged.length}`);
    lines.push(`  Branch: ${context.branch}`);

    return '\n' + lines.join('\n');
  }

  async summarizeCommits(
    commits: string[],
    tickets: Ticket[] = [],
    workContext?: WorkContext
  ): Promise<string> {
    const ticketContext = this.formatTicketContext(tickets);
    const contextInfo = this.formatWorkContext(workContext);

    const prompt = `
You are helping a developer write their daily standup update for a team meeting.
This will be shared with both technical and non-technical team members (managers, PMs, stakeholders).

Here are their git commits from yesterday:
${commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}
${ticketContext}
${contextInfo}

Write a friendly, conversational standup update that anyone can understand.

Format:
Yesterday I worked on:
• [what you accomplished in plain language]
• [another accomplishment - focus on the outcome/value, not technical details]
• [if relevant, mention any collaboration or team impact]

Today I'm planning to:
• [what you'll be focusing on]
• [any continuation of work or new items]

Blockers: None (or describe any challenges)

Guidelines:
- Write in a warm, natural tone - like you're talking to a colleague
- Explain technical work in terms of user impact or business value
  - Instead of "Fixed null pointer exception in auth module"
  - Say "Fixed a login issue that was causing some users to get stuck"
- Instead of "Implemented REST API endpoint for user preferences"
  - Say "Built the backend so users can now save their settings"
- Skip jargon like "refactoring", "debugging", "endpoints", "modules"
- Focus on WHAT changed for users or the team, not HOW you coded it
- Keep it brief and scannable (2-4 bullets per section)
- Use the ticket context to explain the business purpose if available
- Sound human and approachable, not robotic
`;

    return this.suggest(prompt);
  }

  async generatePRDescription(data: {
    branch: string;
    commits: string[];
    files: string[];
    issues: string[];
    ticketDetails?: Ticket[];
  }): Promise<string> {
    // Build ticket context
    let ticketContext = '';
    if (data.ticketDetails && data.ticketDetails.length > 0) {
      ticketContext = this.formatTicketContext(data.ticketDetails);
    }

    const prompt = `
You are helping a developer create a Pull Request description.

Branch: ${data.branch}

Commits:
${data.commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Files changed:
${data.files.join('\n')}

Related tickets: ${data.issues.length > 0 ? data.issues.join(', ') : 'None'}
${ticketContext}

Generate a comprehensive PR description following this template:

## What Changed
- [bullet point 1]
- [bullet point 2]
- [bullet point 3]

## Why
[Business or technical reason for these changes - USE THE TICKET CONTEXT if available to explain the real reason/value]
${data.issues.length > 0 ? `Closes ${data.issues.join(', ')}` : ''}

## How to Test
1. [testing step 1]
2. [testing step 2]
3. [testing step 3]

Requirements:
- Be specific and technical where appropriate
- Use ticket descriptions to explain the WHY (business value)
- Focus on value for code reviewers
- Keep it clear and concise
- No emojis
`;

    return this.suggest(prompt);
  }

  /**
   * Generate structured PR content for filling templates
   */
  async generatePRContent(data: {
    branch: string;
    commits: string[];
    files: string[];
    issues: string[];
    ticketDetails?: Ticket[];
    templateSections?: string[];
  }): Promise<{
    title: string;
    description: string;
    type: string;
    impact: string;
    testing: string;
    breakingChanges: string;
    additionalInfo: string;
  }> {
    // Build ticket context
    let ticketContext = '';
    if (data.ticketDetails && data.ticketDetails.length > 0) {
      ticketContext = this.formatTicketContext(data.ticketDetails);
    }

    const prompt = `
You are helping a developer create a Pull Request. Analyze the changes and generate content.

Branch: ${data.branch}

Commits:
${data.commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Files changed:
${data.files.slice(0, 30).join('\n')}${data.files.length > 30 ? `\n... and ${data.files.length - 30} more files` : ''}

Related tickets: ${data.issues.length > 0 ? data.issues.join(', ') : 'None'}
${ticketContext}

Generate a JSON object with the following fields (respond with ONLY the JSON, no markdown):

{
  "title": "A concise PR title (e.g., 'Add user authentication feature')",
  "description": "2-4 bullet points describing WHAT changed",
  "type": "One of: feat, fix, docs, refactor, test, chore, hotfix, security, style",
  "impact": "1-2 sentences about the impact of these changes",
  "testing": "2-3 numbered steps on how to test these changes",
  "breakingChanges": "Description of breaking changes, or 'None'",
  "additionalInfo": "Any additional context reviewers should know, or 'None'"
}
`;

    const response = await this.suggest(prompt);

    // Parse JSON from response
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If parsing fails, return default structure
    }

    // Fallback: generate simple content
    return {
      title: this.generateSimpleTitle(data.commits),
      description: data.commits
        .slice(0, 5)
        .map((c) => `- ${c}`)
        .join('\n'),
      type: this.detectPRType(data.commits),
      impact: 'See commit messages for details.',
      testing: '1. Pull the branch\n2. Run tests\n3. Manual verification',
      breakingChanges: 'None',
      additionalInfo: 'None',
    };
  }

  /**
   * Generate a simple title from commits
   */
  private generateSimpleTitle(commits: string[]): string {
    if (commits.length === 0) return 'Update';

    // Use the most recent commit as base
    const firstCommit = commits[0];

    // Extract conventional commit type and message
    const match = firstCommit.match(/^(\w+)(?:\([^)]+\))?:\s*(.+)/);
    if (match) {
      const [, type, message] = match;
      return `${type}: ${message}`;
    }

    return firstCommit.length > 60 ? firstCommit.slice(0, 57) + '...' : firstCommit;
  }

  /**
   * Detect PR type from commits
   */
  private detectPRType(commits: string[]): string {
    const types = commits.map((c) => {
      const match = c.match(/^(\w+)(?:\([^)]+\))?:/);
      return match ? match[1] : 'chore';
    });

    // Return most common type
    const counts = types.reduce(
      (acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'chore';
  }

  async generateWeeklySummary(data: {
    commits: string[];
    stats: {
      commits: number;
      linesAdded: number;
      linesRemoved: number;
    };
    closedTickets?: Ticket[];
  }): Promise<string> {
    // Include closed tickets for better context
    let ticketContext = '';
    if (data.closedTickets && data.closedTickets.length > 0) {
      ticketContext = `\nTickets/Tasks Completed This Week:\n${data.closedTickets.map((t) => `  - ${t.id}: ${t.title} [${t.type}]`).join('\n')}`;
    }

    const prompt = `
You are helping a developer create their weekly work summary.

This week's commits:
${data.commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}
${ticketContext}

Statistics:
- ${data.stats.commits} commits
- ${data.stats.linesAdded} lines added
- ${data.stats.linesRemoved} lines removed

Generate a professional weekly summary following this format:

Key Accomplishments:
1. [Major accomplishment with impact - reference ticket if relevant]
2. [Second accomplishment]
3. [Third accomplishment]
4. [Fourth accomplishment]
5. [Fifth accomplishment]

Top Achievement:
[Single sentence highlighting the most impactful work]

Requirements:
- Focus on business value and impact
- Use ticket titles to give context on WHAT and WHY
- Be suitable for sharing with manager or team
- Highlight 3-5 key accomplishments
- Keep it professional
- No emojis
`;

    return this.suggest(prompt);
  }
}
