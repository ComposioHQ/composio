import { expect, test } from 'bun:test';
import { source, mdxToCleanMarkdown } from '../../lib/source';
import { GET as getRoutingMap } from '../../app/llms.txt/route';

function providersPage() {
  const page = source.getPage(['providers']);
  if (!page) throw new Error('Missing providers page');
  return page;
}

test('provider Markdown exposes every current guide and the adapters sharing guides', async () => {
  const markdown = mdxToCleanMarkdown(await providersPage().data.getText('raw'));
  const destinations = new Set(Array.from(
    markdown.matchAll(/^- \[[^\]]+\]\((\/docs\/providers\/[^)]+)\)/gm), match => match[1],
  ));
  const guides = source.getPages().filter(page =>
    page.slugs[0] === 'providers' && page.slugs.length === 2,
  );
  expect([...destinations].sort()).toEqual(guides.map(page => page.url).sort());

  // These adapters share vendor guides and cannot be discovered from titles alone.
  for (const [name, guide] of [
    ['OpenAI Agents SDK', 'openai'],
    ['Claude Agent SDK', 'anthropic'],
    ['Google ADK', 'google'],
    ['LangGraph', 'langchain'],
  ]) {
    expect(markdown).toContain(`[${name}](/docs/providers/${guide})`);
  }
  expect(markdown).toContain('[Anthropic](/docs/providers/anthropic) (Python, TypeScript)');
  for (const slug of ['pi', 'eve']) {
    expect(markdown).toContain(`](/docs/providers/${slug}) (TypeScript; experimental)`);
  }
  expect(markdown).not.toMatch(/ProviderList|languages=|\/>/);
  expect(markdown).toContain('[Cloudflare Workers AI](https://github.com/ComposioHQ/composio/blob/next/ts/packages/providers/cloudflare/README.md) (TypeScript)');
});

test('concise discovery routes OpenAI and Anthropic readers to owned guides', async () => {
  const text = await getRoutingMap().text();
  for (const slug of ['openai', 'anthropic']) {
    expect(text).toContain(`](https://docs.composio.dev/docs/providers/${slug}.md)`);
  }
});
