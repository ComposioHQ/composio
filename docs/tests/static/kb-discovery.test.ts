import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('public KB discovery', () => {
  test('indexes published KB pages below conceptual docs and above examples', async () => {
    const records = await getAlgoliaSearchDocuments();
    const kbRecords = records.filter((record) => record.type === 'kb');

    expect(kbRecords.length).toBeGreaterThan(0);
    expect(kbRecords.every((record) => record.page_rank === 1_800)).toBe(true);
    expect(
      kbRecords.some((record) =>
        record.url.includes('auth-config-list-pages-return-at-most-50-items'),
      ),
    ).toBe(false);
  });

  test('registers the KB source with sitemap, links, and LLM endpoints', () => {
    expect(source('app/sitemap.ts')).toContain('knowledgeBaseSource');
    expect(source('scripts/validate-links.ts')).toContain('knowledgeBaseSource');
    expect(source('app/llms.txt/route.ts')).toContain('knowledgeBaseSource');
    expect(source('app/llms-full.txt/route.ts')).toContain('knowledgeBaseSource');
    expect(source('app/llms.mdx/[[...slug]]/route.ts')).toContain("prefix: 'kb'");
  });
});
