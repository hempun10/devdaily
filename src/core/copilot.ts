import { execa } from 'execa';

export class CopilotClient {
  async isInstalled(): Promise<boolean> {
    try {
      await execa('gh', ['copilot', '--version']);
      return true;
    } catch {
      return false;
    }
  }

  async suggest(prompt: string): Promise<string> {
    try {
      const { stdout } = await execa('gh', ['copilot', 'suggest', '-t', 'shell', prompt]);

      return this.parseOutput(stdout);
    } catch (error) {
      throw new Error(`Copilot CLI error: ${error}`);
    }
  }

  async explain(code: string): Promise<string> {
    try {
      const { stdout } = await execa('gh', ['copilot', 'explain', code]);
      return this.parseOutput(stdout);
    } catch (error) {
      throw new Error(`Copilot CLI error: ${error}`);
    }
  }

  private parseOutput(raw: string): string {
    // The gh copilot CLI wraps output in UI elements
    // We need to extract just the AI response

    // Remove ANSI codes
    // eslint-disable-next-line no-control-regex
    const cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    // Extract the actual suggestion (between prompts)
    const lines = cleaned.split('\n');
    const relevantLines = lines.filter(
      (line) =>
        line.trim() &&
        !line.includes('Suggestion:') &&
        !line.includes('Explain command:') &&
        !line.includes('?')
    );

    return relevantLines.join('\n').trim();
  }

  async summarizeCommits(commits: string[]): Promise<string> {
    const prompt = `
You are helping a developer write their standup notes.

Here are their git commits from yesterday:
${commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Generate a professional standup update following this format:

Yesterday I:
- [achievement 1 with impact]
- [achievement 2 with impact]
- [achievement 3 with impact]

Today I'm working on:
- [planned work based on commits]

Blockers: None

Requirements:
- Make it sound natural and professional
- Focus on WHAT was accomplished, not HOW
- Highlight business impact when possible
- Keep it concise (3-5 bullet points max)
- No emojis
`;

    return this.suggest(prompt);
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
    stats: {
      commits: number;
      linesAdded: number;
      linesRemoved: number;
    };
  }): Promise<string> {
    const prompt = `
You are helping a developer create their weekly work summary.

This week's commits:
${data.commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}

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
`;

    return this.suggest(prompt);
  }
}
