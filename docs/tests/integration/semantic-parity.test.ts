import { beforeAll, expect, test } from 'bun:test';
import { z } from 'zod';
import { fetchPage } from './helpers';
import { assertPageFacts, corpusPages, parityPages } from '../fixtures/semantic-parity';

let corpus: Map<string, string>;
const markdown = new Map<string, string>();
beforeAll(async () => {
  const response = await fetchPage('/llms-full.txt', { timeout: 30_000 });
  expect(response.status, 'llms-full.txt status').toBe(200);
  corpus = corpusPages(await response.text());
  await Promise.all(parityPages.map(async page => {
    const response = await fetchPage(`${page.url}.md`);
    expect(response.status, `HTTP Markdown ${page.url} status`).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/(plain|markdown)/);
    markdown.set(page.url, await response.text());
  }));
});

for (const page of parityPages) {
  const surfaces = [{ name: 'HTTP Markdown', text: () => markdown.get(page.url) ?? '' }];
  // Legacy REST pages are individually readable but intentionally absent from the current corpus.
  if (page.url.startsWith('/reference/v3/')) {
    test(`llms-full.txt excludes legacy page ${page.url}`, () => {
      expect(corpus.has(page.url), `Legacy page leaked into llms-full.txt: ${page.url}`).toBe(false);
    });
  } else {
    surfaces.push({ name: 'llms-full.txt', text: () => corpus.get(page.url) ?? '' });
  }
  for (const surface of surfaces) {
    test(`${surface.name} semantic parity ${page.url}`, () => {
      assertPageFacts(surface.text(), page, surface.name);
    });
    for (const [id, expected] of page.facts) {
      test(`mutation catches ${surface.name} ${page.url} lost fact ${id}`, () => {
        const text = surface.text();
        assertPageFacts(text, page, surface.name);
        const mutated = text.replace(/\s+/g, ' ')
          .split(expected.replace(/\s+/g, ' ')).join('');
        expect(() => assertPageFacts(mutated, page, surface.name)).toThrow(
          `${surface.name} ${page.url} lost fact ${id}`,
        );
      });
    }
  }
}

test('local HTTP search retains section links alongside the added command and code corpus', async () => {
  const query = encodeURIComponent('session has access to every toolkit');
  const response = await fetchPage(`/api/search?query=${query}`);
  expect(response.status).toBe(200);
  const results = z.array(z.object({
    type: z.string(), url: z.string(), content: z.string(),
  })).parse(await response.json());
  const destinations = results
    .filter(result => result.type === 'text'
      && result.content.replace(/<\/?mark>/g, '').includes('every toolkit'))
    .map(result => result.url);
  expect(destinations).toContain('/docs/configuring-sessions#creating-a-session');
});
