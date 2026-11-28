import { expect, test } from 'bun:test';
import { pagePath, parseResults } from '../../scripts/eval-search-comparison';
import { evaluateKbSearchRankings } from '../../lib/knowledge/evaluation';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

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

test('the CLI saves HTTP, invalid JSON, and schema error bodies without retrying requests', async () => {
  const responses = [
    { status: 503, body: '{"error":"retrievers unavailable"}', raw: '{"error":"retrievers unavailable"}' },
    { status: 502, body: '<html>upstream unavailable</html>', raw: '<html>upstream unavailable</html>' },
    { status: 200, body: '{"unexpected":true}', raw: { unexpected: true } },
    { status: 200, body: 'invalid JSON', raw: 'invalid JSON' },
  ];
  let requests = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch() {
      const response = responses[requests++ % responses.length];
      return new Response(response.body, { status: response.status });
    },
  });
  const output = await mkdtemp(join(tmpdir(), 'docs-search-errors-'));
  try {
    const process = Bun.spawn([
      Bun.which('bun')!, new URL('../../scripts/eval-search-comparison.ts', import.meta.url).pathname,
      '--base-url', server.url.href, '--output', output,
    ], { env: { ...Bun.env, DOCS_AI_SEARCH_URL: '' }, stdout: 'ignore', stderr: 'ignore' });
    expect(await process.exited).toBe(1);
    const result = z.object({ runs: z.array(z.object({ rows: z.array(z.object({
      raw: z.unknown(), error: z.string(), hits: z.array(z.unknown()),
    })) })) }).parse(JSON.parse(await readFile(join(output, 'results.json'), 'utf8')));
    const rows = result.runs[0].rows;
    expect(rows.length).toBeGreaterThanOrEqual(responses.length);
    expect(requests).toBe(rows.length);
    for (const [index, row] of rows.entries()) {
      expect(row.raw).toEqual(responses[index % responses.length].raw);
      expect(row.hits).toEqual([]);
    }
    expect(rows[0].error).toContain('HTTP 503');
    expect(rows[1].error).toContain('HTTP 502');
  } finally {
    server.stop(true);
    await rm(output, { recursive: true, force: true });
  }
});
