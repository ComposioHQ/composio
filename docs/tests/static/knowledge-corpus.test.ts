import { describe, expect, test } from 'bun:test';
import sitemap from '@/app/sitemap';
import { GET as getLlmsIndex } from '@/app/llms.txt/route';
import { getAlgoliaSearchDocuments, getDocsSearchIndexes } from '@/lib/search-index';
import { getLocalKnowledgeDiscoveryPaths } from '@/lib/knowledge/discovery';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';

const REQUIRED_PUBLIC_SOURCES: KnowledgeSourceType[] = [
  'docs',
  'kb',
  'oauth-guide',
  'toolkit',
  'example',
  'reference',
  'changelog',
];

describe('unified public knowledge corpus', () => {
  test('contains every public source with normalized canonical metadata', async () => {
    const records = await getAlgoliaSearchDocuments();
    for (const sourceType of REQUIRED_PUBLIC_SOURCES) {
      expect(records.some((record) => record.source_type === sourceType)).toBe(true);
    }
    expect(records.some((record) => record.source_type === 'legacy')).toBe(true);

    for (const record of records) {
      expect(record.canonical_url.length).toBeGreaterThan(0);
      expect(Array.isArray(record.product_areas)).toBe(true);
      expect(Array.isArray(record.toolkit_slugs)).toBe(true);
      expect(Array.isArray(record.intents)).toBe(true);
    }

    expect(records.some((record) => record.canonical_url === 'https://composio.dev/auth/github')).toBe(true);
    expect(records.some((record) => record.canonical_url.includes('auth-config-list-pages-return-at-most-50-items'))).toBe(false);
  });

  test('keeps the local global-search fallback on the same OAuth corpus', async () => {
    const indexes = await getDocsSearchIndexes();
    expect(indexes.some((index) => index.url === 'https://composio.dev/auth/github')).toBe(true);
  });

  test('discovers local hub and browse routes without duplicating external OAuth pages', async () => {
    const paths = await getLocalKnowledgeDiscoveryPaths();
    expect(paths).toContain('/kb');
    expect(paths).toContain('/kb/search');
    expect(paths).toContain('/kb/topic/authentication-and-connected-accounts');
    expect(paths).toContain('/kb/toolkits');
    expect(paths).toContain('/kb/toolkit/strava');
    expect(paths).toContain('/kb/guide/pagination-limits-are-endpoint-specific');
    expect(paths.some((path) => path.startsWith('https://composio.dev/auth/'))).toBe(false);
    expect(paths.some((path) => /^\/kb\/sdk-and-api\/[^/]+$/.test(path))).toBe(false);

    const sitemapUrls = (await sitemap()).map((entry) => entry.url);
    for (const path of paths) {
      expect(sitemapUrls).toContain(`https://docs.composio.dev${path}`);
    }
    expect(sitemapUrls.some((url) => url.startsWith('https://composio.dev/auth/'))).toBe(false);
  });

  test('publishes flat guide and browse routes in the LLM index', async () => {
    const response = await getLlmsIndex();
    const body = await response.text();
    expect(body).toContain('https://docs.composio.dev/kb');
    expect(body).toContain('https://docs.composio.dev/kb/toolkits');
    expect(body).toContain('https://docs.composio.dev/kb/toolkit/strava');
    expect(body).toContain('https://docs.composio.dev/kb/guide/pagination-limits-are-endpoint-specific.md');
    expect(body).not.toContain('/kb/sdk-and-api/pagination-limits-are-endpoint-specific');
    expect(body).not.toContain('https://composio.dev/auth/');
  });
});
