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
  });

  test('discovers every published guide and keeps article files aligned with the manifest', async () => {
    const authoredGuides = getPublishedKbGuides().filter((guide) => guide.articlePath);
    const articlePaths = readdirSync(join(process.cwd(), 'kb/articles'))
      .filter((file) => file.endsWith('.md'))
      .sort();
    const discoveryPaths = await getLocalKnowledgeDiscoveryPaths();
    const records = await getAlgoliaSearchDocuments();

    expect(authoredGuides).toHaveLength(getPublishedKbGuides().length);
    // Every published guide resolves to a file, and no file is orphaned from
    // the manifest. This remains valid regardless of what the KB says.
    const publishedPaths = new Set(authoredGuides.map((guide) => guide.articlePath));
    const manifestPaths = new Set(
      getKbCatalog()
        .guides.map((guide) => guide.articlePath)
        .filter((path): path is string => Boolean(path)),
    );
    for (const path of publishedPaths) {
      expect(articlePaths).toContain(path);
    }
    for (const file of articlePaths) {
      expect(manifestPaths).toContain(file);
    }

    for (const guide of authoredGuides) {
      const url = getKbGuideUrl(guide);
      expect(discoveryPaths).toContain(url);
      expect(records.some((record) => record.source_type === 'kb' && record.canonical_url === url)).toBe(true);
    }
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

  test('explicitly traces runtime KB files into Vercel routes', () => {
    const nextConfig = source('next.config.mjs');

    expect(nextConfig).toContain("'/kb/**': ['./kb/**']");
    expect(nextConfig).toContain(
      "'/api/knowledge-search/**': [...OPENAPI_SPEC_FILES, './content/**', './kb/**']",
    );
  });
});
