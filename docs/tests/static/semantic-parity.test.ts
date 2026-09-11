import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCompleteSearchReplacement } from '../../lib/knowledge/search-replacement';
import type { AlgoliaDocsRecord } from '../../lib/search-index';
import { assertPageFacts, corpusPages, parityPages } from '../fixtures/semantic-parity';

let records: AlgoliaDocsRecord[];
beforeAll(async () => {
  // This is the payload the production sync sends to Algolia, including chunking.
  records = await buildCompleteSearchReplacement({ validateExternal: false });
});

for (const page of parityPages) {
  describe(`semantic parity ${page.url}`, () => {
    test('search ingestion retains each fact on the same page', () => {
      const chunks = records.filter(record => record.page_id === page.url);
      expect(chunks.length, `Missing search page ${page.url}`).toBeGreaterThan(0);
      assertPageFacts(chunks.map(record => record.content).join('\n\n'), page, 'Algolia ingestion');
      if (page.url.startsWith('/reference/v3/')) {
        expect(chunks.every(record => record.source_type === 'legacy')).toBe(true);
      }
    });
  });
}

test('a missing fact fails with its page, fact ID, and surface', () => {
  for (const page of parityPages) {
    for (const [missingId, missingText] of page.facts) {
      const mutated = page.facts.map(([, text]) => text).join('\n').replace(missingText, '');
      expect(() => assertPageFacts(mutated, page, 'mutated export')).toThrow(
        `mutated export ${page.url} lost fact ${missingId}`,
      );
    }
  }
});

test('facts on an adjacent corpus page cannot mask a missing fact', () => {
  const page = parityPages[1];
  const pages = corpusPages(`# Quickstart (${page.url})\nMissing install.\n\n---\n\n# Other (/docs/other)\n${page.facts.map(([, text]) => text).join('\n')}`);
  expect(() => assertPageFacts(pages.get(page.url)!, page, 'full corpus')).toThrow('typescript-install');
});

test('export checker accepts complete chunks and rejects missing pages or invalid input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'docs-parity-'));
  const path = join(directory, 'snapshot.json');
  const snapshot = {
    surface: 'test export', capturedAt: '2026-09-11T00:00:00Z', includesLegacy: true,
    pages: parityPages.flatMap(page => page.facts.map(([, content]) => ({
      url: `https://docs.composio.dev${page.url}.md#chunk`, content,
    }))),
  };
  const run = (input: unknown) => {
    writeFileSync(path, JSON.stringify(input));
    return Bun.spawnSync([process.execPath, 'scripts/check-docs-parity.ts', path]);
  };
  try {
    const complete = run(snapshot);
    expect(complete.exitCode, complete.stderr.toString()).toBe(0);
    const missing = run({ ...snapshot, pages: snapshot.pages.filter(page => !page.url.includes('/quickstart')) });
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('test export /docs/quickstart lost fact typescript-install');
    expect(run({ ...snapshot, pages: [{ url: '/docs', content: 42 }] }).exitCode).not.toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
