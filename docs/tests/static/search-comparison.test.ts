import { expect, test } from 'bun:test';
import { pagePath, parseResults } from '../../scripts/eval-search-comparison';
import { evaluateKbSearchRankings } from '../../lib/knowledge/evaluation';

test('grades the same page equally across current search records and duplicate Cloudflare chunks', () => {
  const current = parseResults('current', {
    mode: 'keyword', results: [{ title: 'Sessions', canonicalUrl: '/docs/how-composio-works#tools', excerpt: 'Meta tools' }],
  });
  const cloudflare = parseResults('cloudflare', {
    success: true, result: { chunks: [
      { text: 'Meta tools', item: { key: 'https://docs.composio.dev/docs/how-composio-works/?q=tools#tools' } },
      { text: 'Another chunk', item: { key: 'https://docs.composio.dev/docs/how-composio-works' } },
    ] },
  });
  expect(current.map(hit => hit.url)).toEqual(cloudflare.map(hit => hit.url));
  expect(cloudflare).toHaveLength(1);
  const cases = [{ id: 'session', kind: 'exact' as const, query: 'session.tools()', expectedUrls: ['/docs/how-composio-works'] }];
  for (const hits of [current, cloudflare]) {
    expect(evaluateKbSearchRankings(cases, new Map([['session', hits.map(hit => hit.url)]]))).toMatchObject({
      answerable: { recallAt5: 1, mrrAt10: 1 },
    });
  }
  expect(() => parseResults('cloudflare', { success: false, errors: ['unavailable'] })).toThrow();
  expect(() => parseResults('current', { results: [] })).toThrow();
  expect(() => pagePath('https://composio.dev/pricing')).toThrow('Non-docs result');
});
