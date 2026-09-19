import { expect, test } from 'bun:test';
import { fetchPage } from './helpers';

test('install commands and setup prompts survive HTTP Markdown and the full corpus', async () => {
  const cases = [
    ['/docs/quickstart.md', 'npm install @composio/core', 'uv add python-dotenv composio', 'Use @composio/slim'],
    ['/docs/providers/anthropic.md', 'npm install @composio/core @composio/anthropic', 'pip install composio composio_anthropic'],
    ['/docs/agent-setup/clients.md', 'Use the $composio skill', 'Use the /composio skill'],
    ['/llms-full.txt', 'npm install @composio/core', 'uv add python-dotenv composio', 'Use @composio/slim'],
  ];
  for (const [path, ...facts] of cases) {
    const response = await fetchPage(path);
    expect(response.status, path).toBe(200);
    const text = await response.text();
    for (const fact of facts) expect(text, `${path}: ${fact}`).toContain(fact);
  }
});
