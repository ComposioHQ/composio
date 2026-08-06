import { describe, expect, test } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

const QUICKSTART_PATH = join(import.meta.dir, '../../content/docs/quickstart.mdx');

describe('Quickstart default path', () => {
  test('presents one linear OpenAI Agents and Python flow before alternatives', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');
    const milestones = [
      '<StepTitle>Initialize the project</StepTitle>',
      '<StepTitle>Install the dependencies</StepTitle>',
      '<StepTitle>Add your API keys</StepTitle>',
      '<StepTitle>Create the agent</StepTitle>',
      '<StepTitle>Run the agent</StepTitle>',
      '<StepTitle>Confirm the result</StepTitle>',
      '## Choose another path',
    ];
    const positions = milestones.map(milestone => content.indexOf(milestone));

    expect(positions.every(position => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(content).not.toContain('<QuickstartFlow>');
    expect(content).not.toContain('<FrameworkOption');
  });

  test('includes runnable setup, connection recovery, and success checks', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');

    expect(content).toContain('uv init --app --python 3.10 composio-quickstart');
    expect(content).toContain(
      'uv add python-dotenv composio composio-openai-agents openai-agents'
    );
    expect(content).toContain('title="main.py"');
    expect(content).toContain('composio.create(user_id="quickstart-user")');
    expect(content).toContain('uv run main.py');
    expect(content).toContain('the agent returns a Connect Link');
    expect(content).toContain('Composio quickstart complete.');
    expect(content).toContain('[Logs API](/reference/api-reference/logs)');
  });
});
