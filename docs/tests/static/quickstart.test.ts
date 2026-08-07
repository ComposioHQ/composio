import { describe, expect, test } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

const QUICKSTART_PATH = join(import.meta.dir, '../../content/docs/quickstart.mdx');

describe('Quickstart default path', () => {
  test('presents one linear OpenAI Agents and Python flow before adaptations', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');
    const milestones = [
      '<StepTitle>Initialize the project</StepTitle>',
      '<StepTitle>Install the dependencies</StepTitle>',
      '<StepTitle>Add your API keys</StepTitle>',
      '<StepTitle>Create the agent</StepTitle>',
      '<StepTitle>Run the agent</StepTitle>',
      '## How the tool router works',
      '## Adapt it to your stack',
    ];
    const positions = milestones.map(milestone => content.indexOf(milestone));

    expect(positions.every(position => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(content).not.toContain('<QuickstartFlow>');
    expect(content).not.toContain('<FrameworkOption');
    expect(content).not.toContain('Finish this path');
    expect(content).not.toContain('respond exactly');
  });

  test('includes runnable setup, a general task loop, and connection recovery', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');

    expect(content).toContain('uv init --app --python 3.10 composio-quickstart');
    expect(content).toContain(
      'uv add python-dotenv composio composio-openai-agents openai-agents'
    );
    expect(content).toContain('title="main.py"');
    expect(content).toContain(
      'composio_session = composio.sessions.create(user_id="quickstart-user")'
    );
    expect(content).toContain('tools = composio_session.tools()');
    expect(content).toContain('conversation = SQLiteSession("quickstart-conversation")');
    expect(content).toContain('task = input("You: ").strip()');
    expect(content).toContain('uv run main.py');
    expect(content).toContain('the agent returns a Connect Link');
    expect(content).toContain('[Logs API](/reference/api-reference/logs)');
    expect(content).not.toContain('Star the composiohq/composio repository');
  });

  test('teaches the reusable session and tool-router mental model', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');

    expect(content).toContain('The task changes; the session pattern does not.');
    expect(content).toContain('a small set of meta tools—not thousands of app-tool schemas');
    expect(content).toContain('These are examples, not a required sequence.');
    expect(content).toContain('[supported providers and frameworks](/docs/providers)');
    expect(content).toContain('[Using sessions via MCP](/docs/sessions-via-mcp)');
  });
});
