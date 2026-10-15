#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

/**
 * @typedef {{id: string, query: string, source: string, expect: string[][]}} Query
 * @typedef {{source?: string, text: string, generationDate?: string}} Snippet
 * @typedef {{status: 'PASS'|'FAIL'|'ERROR', missing?: string[][], snippets?: Snippet[], error?: string}} Result
 * @typedef {{codeId?: string, codeTitle?: string, codeDescription?: string, generationDate?: string, codeList: {code: string}[]}} CodeSnippet
 * @typedef {{codeSnippets: CodeSnippet[], infoSnippets: {pageId?: string, content: string}[], rules?: object}} ContextResponse
 */

const endpoint = 'https://context7.com/api/v2/context';
/** @param {string} text */
const normalize = text => text.toLowerCase().replace(/\s+/g, ' ').trim();

// Only retrieved content counts as evidence, never titles, URLs, or injected rules.
/**
 * @param {Query} query
 * @param {ContextResponse} payload
 * @returns {Result}
 */
export function evaluate(query, payload) {
  if (!Array.isArray(payload.codeSnippets) || !Array.isArray(payload.infoSnippets)) {
    throw new Error('Invalid Context7 response: expected codeSnippets and infoSnippets arrays');
  }
  const snippets = [
    ...payload.codeSnippets.flatMap(snippet => {
      if (!Array.isArray(snippet.codeList)) throw new Error('Invalid Context7 codeList');
      return snippet.codeList.map(example => ({
        source: snippet.codeId,
        text: example.code,
        generationDate: snippet.generationDate,
      }));
    }),
    ...payload.infoSnippets.map(snippet => ({ source: snippet.pageId, text: snippet.content })),
  ];
  if (snippets.some(snippet => typeof snippet.text !== 'string')) {
    throw new Error('Invalid Context7 snippet content');
  }
  const content = snippets.map(snippet => normalize(snippet.text));
  const missing = query.expect.filter(
    alternatives => !alternatives.some(term => content.some(text => text.includes(normalize(term))))
  );
  return { status: missing.length ? 'FAIL' : 'PASS', missing, snippets };
}

/**
 * @param {{libraryId: string, queries: Query[]}} suite
 * @param {{apiKey?: string, fetchImpl?: (url: URL, init: RequestInit) => Promise<Response>, log?: (line: string) => void}} options
 */
export async function runSuite(suite, { apiKey, fetchImpl = fetch, log = console.log } = {}) {
  const results = [];
  for (const query of suite.queries) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      libraryId: suite.libraryId,
      query: query.query,
      type: 'json',
    }).toString();
    /** @type {Result} */
    let result;
    try {
      const response = await fetchImpl(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(60_000),
        redirect: 'error',
      });
      // 202 means indexing is pending, not a successful retrieval.
      if (response.status !== 200) {
        throw new Error(`Context7 HTTP ${response.status}; no retrieval evidence`);
      }
      result = evaluate(query, await response.json());
    } catch (error) {
      // Don't print server bodies, request headers, or credentials.
      result = {
        status: 'ERROR',
        error:
          error instanceof Error
            ? error.message.replaceAll(apiKey || '\0', '[REDACTED]')
            : 'Retrieval failed',
      };
    }
    results.push({ ...query, ...result });
    log(
      `${result.status} ${query.id}${result.missing?.length ? ` missing ${JSON.stringify(result.missing)}` : ''}${result.error ? `: ${result.error}` : ''}`
    );
  }
  const totals = { PASS: 0, FAIL: 0, ERROR: 0 };
  for (const result of results) totals[result.status]++;
  log(
    `${results.length} queries: ${totals.PASS} passed, ${totals.FAIL} failed, ${totals.ERROR} errors`
  );
  return { libraryId: suite.libraryId, endpoint, totals, results };
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: { output: { type: 'string' } } });
    const suiteText = await readFile(new URL('./context7-queries.json', import.meta.url), 'utf8');
    const suite = JSON.parse(suiteText);
    const suiteSha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(suiteText))),
      byte => byte.toString(16).padStart(2, '0')
    ).join('');
    const startedAt = new Date().toISOString();
    const report = await runSuite(suite, { apiKey: process.env.CONTEXT7_API_KEY });
    if (values.output) {
      await writeFile(
        values.output,
        `${JSON.stringify(
          {
            startedAt,
            completedAt: new Date().toISOString(),
            suiteSha256,
            config: JSON.parse(
              await readFile(new URL('../context7.json', import.meta.url), 'utf8')
            ),
            ...report,
          },
          null,
          2
        )}\n`
      );
    }
    process.exitCode = report.totals.FAIL || report.totals.ERROR ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Context7 check failed');
    process.exitCode = 1;
  }
}
