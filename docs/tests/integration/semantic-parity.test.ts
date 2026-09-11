import { beforeAll, expect, test } from 'bun:test';
import { fetchPage } from './helpers';
import { assertPageFacts, corpusPages, parityPages } from '../fixtures/semantic-parity';

let corpus: Map<string, string>;
beforeAll(async () => {
  const response = await fetchPage('/llms-full.txt', { timeout: 30_000 });
  expect(response.status).toBe(200);
  corpus = corpusPages(await response.text());
});

for (const page of parityPages) {
  test(`HTTP Markdown semantic parity ${page.url}`, async () => {
    const response = await fetchPage(`${page.url}.md`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/(plain|markdown)/);
    assertPageFacts(await response.text(), page, 'HTTP Markdown');
  });

  test(`full corpus semantic parity ${page.url}`, () => {
    // The current corpus deliberately excludes legacy REST pages.
    if (page.url.startsWith('/reference/v3/')) {
      expect(corpus.has(page.url), `Legacy page leaked into llms-full.txt: ${page.url}`).toBe(false);
      return;
    }
    expect(corpus.has(page.url), `Missing llms-full.txt page ${page.url}`).toBe(true);
    assertPageFacts(corpus.get(page.url)!, page, 'llms-full.txt');
  });
}
