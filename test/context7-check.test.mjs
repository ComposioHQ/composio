import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { evaluate, runSuite } from '../scripts/context7-check.mjs';

const query = {
  id: 'current-api',
  query: 'Which REST API should new code use?',
  source: 'https://example.test/current-api',
  expect: [['https://backend.composio.dev/api/v3.1'], ['x-api-key', 'project API key']],
};
/** @param {string} content */
const payload = content => ({ codeSnippets: [], infoSnippets: [{ content }] });

test('stale API retrieval fails even when another required fact is present', () => {
  const result = evaluate(
    query,
    payload('Use https://backend.composio.dev/api/v3 with x-api-key.')
  );
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.missing, [['https://backend.composio.dev/api/v3.1']]);
});

test('alternatives ignore case and whitespace, without combining unrelated snippets into one fact', () => {
  const result = evaluate(query, {
    codeSnippets: [
      {
        codeId: 'https://example.test/code',
        codeList: [{ code: 'https://backend.composio.dev/api/v3.1' }],
      },
    ],
    infoSnippets: [{ content: 'Authenticate with a PROJECT\n  API KEY.' }],
  });
  assert.equal(result.status, 'PASS');
  assert.equal(
    evaluate(
      { ...query, expect: [['project API key']] },
      {
        codeSnippets: [],
        infoSnippets: [{ content: 'project API' }, { content: 'key' }],
      }
    ).status,
    'FAIL'
  );
});

test('URLs, titles, descriptions, and injected rules cannot mask missing documentation', () => {
  const result = evaluate(query, {
    codeSnippets: [
      {
        codeId: query.expect[0][0],
        codeTitle: 'x-api-key',
        codeDescription: 'x-api-key',
        codeList: [{ code: 'obsolete example' }],
      },
    ],
    infoSnippets: [{ pageId: query.expect[0][0], content: 'unrelated content' }],
    rules: { libraryOwn: ['Use https://backend.composio.dev/api/v3.1 with x-api-key'] },
  });
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.missing, query.expect);
  assert.equal(evaluate(query, payload('')).status, 'FAIL');
});

test('malformed and pending retrievals are errors, not regression passes; later queries still run', async () => {
  const responses = [
    new Response('{}', { status: 202 }),
    Response.json({ codeSnippets: [], infoSnippets: [{ content: null }] }),
    new Response('{}', { status: 429 }),
    Response.json(payload('Use https://backend.composio.dev/api/v3.1 with x-api-key')),
  ];
  const result = await runSuite(
    {
      libraryId: '/synthetic/library',
      queries: responses.map((_, i) => ({ ...query, id: `case-${i}` })),
    },
    {
      fetchImpl: async () => {
        const response = responses.shift();
        assert.ok(response);
        return response;
      },
      log: () => {},
    }
  );
  assert.deepEqual(
    result.results.map(item => item.status),
    ['ERROR', 'ERROR', 'ERROR', 'PASS']
  );
  assert.deepEqual(result.totals, { PASS: 1, FAIL: 0, ERROR: 3 });
});

test('network failures are distinct from missing facts and redact credentials', async () => {
  const result = await runSuite(
    { libraryId: '/synthetic/library', queries: [query] },
    {
      apiKey: 'synthetic-secret',
      fetchImpl: async () => {
        throw new Error('network unavailable synthetic-secret');
      },
      log: () => {},
    }
  );
  assert.deepEqual(result.totals, { PASS: 0, FAIL: 0, ERROR: 1 });
  assert.equal(result.results[0].error, 'network unavailable [REDACTED]');
});

test('owner rules fit Context7 public schema limits instead of being rejected for length', async () => {
  // https://context7.com/schema/context7.json: rules.maxItems and rules.items.maxLength.
  const config = JSON.parse(await readFile(new URL('../context7.json', import.meta.url), 'utf8'));
  assert.ok(config.rules.length <= 50, 'Context7 accepts at most 50 rules');
  for (const rule of config.rules) {
    assert.ok(
      rule.length >= 1 && rule.length <= 255,
      `Invalid Context7 rule length: ${rule.length}`
    );
  }
});
