import { beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdvancedIndex } from 'fumadocs-core/search/server';
import { buildCompleteSearchReplacement } from '../../lib/knowledge/search-replacement';
import { getDocsSearchIndexes, type AlgoliaDocsRecord } from '../../lib/search-index';
import { assertPageFacts, corpusPages, parityPages } from '../fixtures/semantic-parity';

let records: AlgoliaDocsRecord[];
let localIndexes: AdvancedIndex[];
beforeAll(async () => {
  // Exercise both production search ingestion and the /api/search fallback corpus.
  [records, localIndexes] = await Promise.all([
    buildCompleteSearchReplacement({ validateExternal: false }),
    getDocsSearchIndexes(),
  ]);
});

for (const page of parityPages) {
  const surfaces = [
    {
      name: 'Algolia ingestion',
      text: () => records.filter(record => record.page_id === page.url)
        .sort((a, b) => a.position - b.position)
        .map(record => record.content).join('\n\n'),
    },
    {
      name: 'local search corpus',
      text: () => localIndexes.find(index => index.url === page.url)
        ?.structuredData.contents.map(item => item.content).join('\n\n') ?? '',
    },
  ];
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

test('legacy REST records remain classified as legacy in the search payload', () => {
  const legacy = records.filter(record => record.page_id === '/reference/v3/api-reference/tools');
  expect(legacy.length).toBeGreaterThan(0);
  expect(legacy.every(record => record.source_type === 'legacy')).toBe(true);
});

test('facts on an adjacent corpus page cannot mask a missing fact', () => {
  const page = parityPages[1];
  const pages = corpusPages(`# Quickstart (${page.url})\nMissing install.\n\n---\n\n# Other (/docs/other)\n${page.facts.map(([, text]) => text).join('\n')}`);
  expect(() => assertPageFacts(pages.get(page.url)!, page, 'llms-full.txt')).toThrow(
    'llms-full.txt /docs/quickstart lost fact typescript-install',
  );
});

test('external checker preserves ordered line chunks and names missing facts and pages', () => {
  const directory = mkdtempSync(join(tmpdir(), 'docs-parity-'));
  const path = join(directory, 'snapshot.json');
  const snapshot = {
    surface: 'test external export', capturedAt: '2026-10-14T00:00:00Z', includesLegacy: true,
    pages: parityPages.flatMap(page => records
      .filter(record => record.page_id === page.url)
      .sort((a, b) => a.position - b.position)
      // Regression for #4443: split multi-line facts between adjacent chunks.
      .flatMap(record => record.content.split('\n').map(content => ({
        url: `https://docs.composio.dev${page.url}.md#chunk`, content,
      })))),
  };
  const run = (input: unknown) => {
    writeFileSync(path, JSON.stringify(input));
    return Bun.spawnSync([process.execPath, 'scripts/check-docs-parity.ts', path]);
  };
  try {
    const complete = run(snapshot);
    expect(complete.exitCode, complete.stderr.toString()).toBe(0);
    const missingFact = run({ ...snapshot, pages: snapshot.pages.map(page => ({
      ...page,
      content: page.content.replaceAll('composio login', ''),
    })) });
    expect(missingFact.exitCode).not.toBe(0);
    const diagnostic = 'test external export /docs/agent-plugins lost fact login-and-setup';
    expect(missingFact.stderr.toString()).toContain(diagnostic);
    console.info(`Expected mutation caught (checker exit ${missingFact.exitCode}): ${diagnostic}`);
    const missingPage = run({ ...snapshot, pages: snapshot.pages.filter(page => !page.url.includes('/quickstart')) });
    expect(missingPage.exitCode).not.toBe(0);
    expect(missingPage.stderr.toString()).toContain('test external export /docs/quickstart lost fact typescript-install');
    const currentOnly = run({ ...snapshot, includesLegacy: false,
      pages: snapshot.pages.filter(page => !page.url.includes('/reference/v3/')) });
    expect(currentOnly.exitCode, currentOnly.stderr.toString()).toBe(0);
    expect(run({ ...snapshot, pages: [{ url: '/docs', content: 42 }] }).exitCode).not.toBe(0);
    expect(run({ ...snapshot, pages: [{ url: 'https://example.com/docs', content: '' }] }).exitCode).not.toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
