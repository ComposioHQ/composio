import { expect, test } from 'bun:test';
import { getLLMText } from '../../lib/source';
import { readFileSync } from 'node:fs';

test('page Markdown and the full corpus route agents to dated release notes', async () => {
  const markdown = await getLLMText({
    url: '/docs/quickstart',
    data: { title: 'Quickstart', getText: async () => 'Install the SDK.' },
  });
  expect(markdown).toContain('[Changelog](https://docs.composio.dev/docs/changelog.md)');
  expect(readFileSync('app/llms-full.txt/route.ts', 'utf8'))
    .toContain('[Changelog](https://docs.composio.dev/docs/changelog.md)');
});
