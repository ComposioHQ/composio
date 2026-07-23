import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';
import { getKbGuideUrl, getKbCatalog, getPublishedKbGuides } from '@/lib/kb/repository';
import { getLocalKnowledgeDiscoveryPaths } from '@/lib/knowledge/discovery';

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('public KB discovery', () => {
  test('indexes published KB pages below conceptual docs and above examples', async () => {
    const records = await getAlgoliaSearchDocuments();
    const kbRecords = records.filter((record) => record.source_type === 'kb');

    expect(kbRecords.length).toBeGreaterThan(0);
    expect(kbRecords.every((record) => record.page_rank === 1_900)).toBe(true);
    expect(
      kbRecords.some((record) =>
        record.url.includes('auth-config-list-pages-return-at-most-50-items'),
      ),
    ).toBe(false);
  });

  test('discovers every authored guide while excluding held candidates from routes and search', async () => {
    const authoredGuides = getPublishedKbGuides().filter((guide) => guide.articlePath);
    const articlePaths = readdirSync(join(process.cwd(), 'kb/articles'))
      .filter((file) => file.endsWith('.md'))
      .sort();
    const discoveryPaths = await getLocalKnowledgeDiscoveryPaths();
    const records = await getAlgoliaSearchDocuments();
    const held = getKbCatalog().guides.find(
      (guide) => guide.slug === 'auth-config-list-pages-return-at-most-50-items',
    );

    expect(authoredGuides).toHaveLength(17);
    expect(authoredGuides.map((guide) => guide.articlePath).sort()).toEqual(articlePaths);

    for (const guide of authoredGuides) {
      const url = getKbGuideUrl(guide);
      expect(discoveryPaths).toContain(url);
      expect(records.some((record) => record.source_type === 'kb' && record.canonical_url === url)).toBe(true);
    }

    expect(held).toBeDefined();
    const heldUrl = getKbGuideUrl(held!);
    expect(discoveryPaths).not.toContain(heldUrl);
    expect(records.some((record) => record.canonical_url === heldUrl)).toBe(false);
  });

  test('registers the KB source with sitemap, links, and LLM endpoints', () => {
    expect(source('app/sitemap.ts')).toContain('knowledgeBaseSource');
    expect(source('app/sitemap.ts')).toContain('getLocalKnowledgeDiscoveryPaths');
    expect(source('scripts/validate-links.ts')).toContain('knowledgeBaseSource');
    expect(source('scripts/validate-links.ts')).toContain('getLocalKnowledgeDiscoveryPaths');
    expect(source('app/llms.txt/route.ts')).toContain('knowledgeBaseSource');
    expect(source('app/llms.txt/route.ts')).toContain('getLocalKnowledgeDiscoveryPaths');
    expect(source('app/llms-full.txt/route.ts')).toContain('knowledgeBaseSource');
    expect(source('app/llms-full.txt/route.ts')).toContain('getLocalKnowledgeDiscoveryPaths');
    expect(source('app/llms.mdx/[[...slug]]/route.ts')).toContain("prefix: 'kb'");
    expect(source('app/llms.mdx/[[...slug]]/route.ts')).toContain('knowledgeBrowseToMarkdown');
  });
});
