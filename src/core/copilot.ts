import { execa } from 'execa';

export class CopilotClient {
  async isInstalled(): Promise<boolean> {
    try {
      // Check for new GitHub Copilot CLI
      await execa('copilot', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  async suggest(prompt: string, onStream?: (chunk: string) => void): Promise<string> {
    try {
      // Use new Copilot CLI with non-interactive mode
      if (onStream) {
        // Stream mode
        let output = '';
        const subprocess = execa('copilot', ['-p', prompt, '--allow-all-tools']);

        subprocess.stdout?.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          onStream(this.parseOutput(output));
        });

        await subprocess;
        return this.parseOutput(output);
      } else {
        // Non-stream mode
        const { stdout } = await execa('copilot', ['-p', prompt, '--allow-all-tools']);
        return this.parseOutput(stdout);
      }
    } catch (error) {
      throw new Error(`Copilot CLI error: ${error}`);
    }
  }

  async explain(code: string): Promise<string> {
    try {
      const { stdout } = await execa('copilot', [
        '-p',
        `Explain this code: ${code}`,
        '--allow-all-tools',
      ]);
      return this.parseOutput(stdout);
    } catch (error) {
      throw new Error(`Copilot CLI error: ${error}`);
    }
  }

  private parseOutput(raw: string): string {
    // Remove ANSI codes

    const cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    // Split into lines
    const lines = cleaned.split('\n');

    // Find the main content (skip usage stats at the end)
    const endMarkers = [
      'Total usage est:',
      'API time spent:',
      'Total session time:',
      'Breakdown by AI model:',
    ];

    const contentLines: string[] = [];

    for (const line of lines) {
      if (endMarkers.some((marker) => line.includes(marker))) {
        break;
      }
      contentLines.push(line);
    }

    // Join and clean up
    let result = contentLines.join('\n').trim();

    // Remove common AI preamble phrases
    const preambles = [
      /^Based on the (?:git commits?|commit history|commits),?\s*here'?s?\s*(?:a|your)?\s*professional\s*(?:standup|weekly)?\s*(?:update|summary|note)?:?\s*/i,
      /^Based on the commits?,?\s*here'?s?\s*(?:a|your)?\s*professional\s*(?:standup|weekly)?\s*(?:update|summary|note)?:?\s*/i,
      /^Here'?s?\s*(?:a|your)?\s*professional\s*(?:standup|weekly)?\s*(?:update|summary|note)?:?\s*/i,
      /^I'll (?:create|generate|help you create)\s*(?:a|your)?\s*(?:standup|weekly)?\s*(?:update|summary|note)?:?\s*/i,
    ];

    for (const pattern of preambles) {
      result = result.replace(pattern, '');
    }

    // Trim again after removing preamble
    result = result.trim();

    return result;
  }

  async summarizeCommits(
    commits: string[],
    files?: string[],
    onStream?: (chunk: string) => void
  ): Promise<string> {
    const filesContext =
      files && files.length > 0
        ? `\n\nFiles changed:\n${files.slice(0, 20).join('\n')}${files.length > 20 ? '\n... and more' : ''}`
        : '';

    const prompt = `
You are helping a developer write their standup notes.

Here are their git commits:
${commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}${filesContext}

Generate a concise standup update following this format:

**What I accomplished:**
- [achievement 1 with impact]
- [achievement 2 with impact]
- [achievement 3 with impact]

Requirements:
- Make it sound natural and professional
- Focus on WHAT was accomplished, not HOW
- Highlight business impact when possible
- Keep it concise (3-5 bullet points max)
- No emojis
- DO NOT include preamble like "Based on commits" or "Here's a summary"
- DO NOT include "Today I'm working on" or "Blockers" sections
- Start directly with "**What I accomplished:**"
`;

    return this.suggest(prompt, onStream);
  }

  async generatePRDescription(data: {
    branch: string;
    commits: string[];
    files: string[];
    issues: string[];
  }): Promise<string> {
    const prompt = `
You are helping a developer create a Pull Request description.

Branch: ${data.branch}

Commits:
${data.commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Files changed:
${data.files.join('\n')}

Related issues: ${data.issues.length > 0 ? data.issues.join(', ') : 'None'}

Generate a comprehensive PR description following this template:

## What Changed
- [bullet point 1]
- [bullet point 2]
- [bullet point 3]

## Why
[Business or technical reason for these changes]
${data.issues.length > 0 ? `Closes ${data.issues.join(', ')}` : ''}

## How to Test
1. [testing step 1]
2. [testing step 2]
3. [testing step 3]

Requirements:
- Be specific and technical where appropriate
- Focus on value for code reviewers
- Keep it clear and concise
- No emojis
`;

    return this.suggest(prompt);
  }

  async generateWeeklySummary(data: {
    commits: string[];
    files?: string[];
    stats: {
      commits: number;
      linesAdded: number;
      linesRemoved: number;
    };
  }): Promise<string> {
    const filesContext =
      data.files && data.files.length > 0
        ? `\n\nKey files changed:\n${data.files.slice(0, 30).join('\n')}${data.files.length > 30 ? '\n... and more' : ''}`
        : '';

    const prompt = `
You are helping a developer create their weekly work summary.

This week's commits:
${data.commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}${filesContext}

Statistics:
- ${data.stats.commits} commits
- ${data.stats.linesAdded} lines added
- ${data.stats.linesRemoved} lines removed

Generate a professional weekly summary following this format:

Key Accomplishments:
1. [Major accomplishment with impact]
2. [Second accomplishment]
3. [Third accomplishment]
4. [Fourth accomplishment]
5. [Fifth accomplishment]

Top Achievement:
[Single sentence highlighting the most impactful work]

Requirements:
- Focus on business value and impact
- Be suitable for sharing with manager or team
- Highlight 3-5 key accomplishments
- Keep it professional
- No emojis
- DO NOT include preamble like "Based on commits" or "Here's a summary"
- Start directly with "Key Accomplishments:"
`;

    return this.suggest(prompt);
  }
}
