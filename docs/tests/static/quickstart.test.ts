import { describe, expect, test } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

const QUICKSTART_PATH = join(import.meta.dir, '../../content/docs/quickstart.mdx');

describe('Quickstart default path', () => {
  test('presents one linear OpenAI Agents and Python flow before adaptations', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');
    const milestones = [
      '<StepTitle>Create the project</StepTitle>',
      '<StepTitle>Install the packages</StepTitle>',
      '<StepTitle>Set your API keys</StepTitle>',
      '<StepTitle>Add the agent</StepTitle>',
      '<StepTitle>Run it</StepTitle>',
      '## What just happened?',
      '## Adapt the example',
    ];
    const positions = milestones.map(milestone => content.indexOf(milestone));

    expect(positions.every(position => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(content).not.toContain('<QuickstartFlow>');
    expect(content).not.toContain('<FrameworkOption');
    expect(content).not.toContain('Finish this path');
    expect(content).not.toContain('respond exactly');
  });

  test('supports interactive and one-shot tasks', async () => {
    const content = await readFile(QUICKSTART_PATH, 'utf-8');

    expect(content).toContain('uv init --app --python 3.10 composio-quickstart');
    expect(content).toContain(
      'uv add python-dotenv composio composio-openai-agents openai-agents'
    );
    expect(content).toContain('session = composio.sessions.create(user_id="quickstart-user")');
    expect(content).toContain('if len(sys.argv) > 1:');
    expect(content).toContain('run_task(" ".join(sys.argv[1:]))');
    expect(content).toContain('task = input("You: ").strip()');
    expect(content).toContain('uv run main.py "Find the three most recent open issues');
    expect(content).toContain('the agent gives you a Connect Link');
    expect(content).toContain('a small set of meta tools for finding, connecting, and running app tools');
    expect(content).toContain('composio.use(session_id)');
  });
});
