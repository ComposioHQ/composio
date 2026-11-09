import { expect, test } from 'bun:test';
import { fetchPage } from './helpers';

async function providerLinks(html: string): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  let href = '';
  await new HTMLRewriter()
    .on('article ul > li > a', {
      element(element) {
        const target = element.getAttribute('href') ?? '';
        href = target.startsWith('/docs/providers/') || target.includes('/ts/packages/providers/cloudflare/')
          ? target : '';
      },
      text(text) {
        if (href) links.set(href, (links.get(href) ?? '') + text.text);
      },
    })
    .transform(new Response(html))
    .text();
  return links;
}

test('providers are semantic linked lists in server HTML and processed Markdown', async () => {
  const htmlResponse = await fetchPage('/docs/providers', { timeout: 120_000 });
  expect(htmlResponse.status).toBe(200);
  expect(htmlResponse.headers.get('content-type')).toContain('text/html');
  const html = await htmlResponse.text();
  const links = await providerLinks(html);

  const markdownResponse = await fetchPage('/docs/providers.md', { timeout: 120_000 });
  expect(markdownResponse.status).toBe(200);
  expect(markdownResponse.headers.get('content-type')).toContain('text/markdown');
  const markdown = await markdownResponse.text();
  const providerSection = markdown.split('## AI SDKs')[1]?.split('More documentation')[0] ?? '';
  const markdownLinks = Array.from(providerSection.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)/gm));
  expect([...links.keys()].sort()).toEqual([...new Set(markdownLinks.map(match => match[2]))].sort());
  for (const [, name, href] of markdownLinks) expect(links.get(href), href).toContain(name);
  for (const [name, slug] of [
    ['Anthropic', 'anthropic'], ['OpenAI Agents SDK', 'openai'],
    ['Claude Agent SDK', 'anthropic'], ['Google ADK', 'google'],
    ['LangGraph', 'langchain'], ['Eve', 'eve'], ['Build your own', 'custom-providers'],
  ]) {
    expect(links.get(`/docs/providers/${slug}`)).toContain(name);
    expect(providerSection).toContain(`[${name}](/docs/providers/${slug})`);
  }
  for (const slug of ['pi', 'eve']) {
    expect(links.get(`/docs/providers/${slug}`)).toContain('Experimental');
    expect(providerSection).toContain(`](/docs/providers/${slug}) (TypeScript; experimental)`);
  }
  expect(providerSection).not.toMatch(/ProviderList|languages=|\/>/);
  expect(links.get('https://github.com/ComposioHQ/composio/blob/next/ts/packages/providers/cloudflare/README.md'))
    .toContain('Cloudflare Workers AI');
}, 180_000);
