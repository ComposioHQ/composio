import { describe, expect, test } from 'bun:test';
import sitemap from '@/app/sitemap';
import { GET as getLlmsIndex } from '@/app/llms-index.txt/route';
import { getAlgoliaSearchDocuments, getDocsSearchIndexes } from '@/lib/search-index';
import * as searchIndexModule from '@/lib/search-index';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';

const REQUIRED_PUBLIC_SOURCES: KnowledgeSourceType[] = [
  'docs',
  'oauth-guide',
  'toolkit',
  'example',
  'reference',
  'changelog',
];

describe('unified public knowledge corpus', () => {
  test('does not interpret fenced code comments as document headings', () => {
    const recordsFromMarkdownPage = (
      searchIndexModule as {
        recordsFromMarkdownPage?: (input: {
          url: string;
          type: string;
          title: string;
          markdown: string;
        }) => Array<{ section?: string; content: string }>;
      }
    ).recordsFromMarkdownPage;

    expect(typeof recordsFromMarkdownPage).toBe('function');
    if (!recordsFromMarkdownPage) return;

    const records = recordsFromMarkdownPage({
      url: '/docs/test-fenced-comments',
      type: 'docs',
      title: 'Fenced comments',
      markdown: [
        '# Fenced comments',
        '',
        '## Setup',
        '',
        'Before code.',
        '',
        '```python',
        '# not a heading',
        'value = 1',
        '```',
        '',
        '## Next',
        '',
        'After code.',
      ].join('\n'),
    });

    expect(records.map(record => record.section)).toEqual([
      'Fenced comments',
      'Setup',
      'Next',
    ]);
    expect(records.find(record => record.section === 'Setup')?.content)
      .toContain('# not a heading');
  });

  test('excludes hidden API operations from local and Algolia search corpora', async () => {
    const hiddenOperationUrls = [
      '/reference/api-reference/invite-codes/postOrgClankerCreateClaim',
      '/reference/api-reference/authentication/getAuthSessionInfo',
    ];
    const [records, indexes] = await Promise.all([
      getAlgoliaSearchDocuments(),
      getDocsSearchIndexes(),
    ]);

    for (const url of hiddenOperationUrls) {
      expect(records.some((record) => record.url === url)).toBe(false);
      expect(indexes.some((index) => index.url === url)).toBe(false);
    }
  });

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
  });

  test('keeps the local global-search fallback on the same OAuth corpus', async () => {
    const indexes = await getDocsSearchIndexes();
    const records = await getAlgoliaSearchDocuments();
    const oauthUrls = new Set(
      records.filter(record => record.source_type === 'oauth-guide').map(record => record.canonical_url),
    );
    expect(oauthUrls.size).toBeGreaterThan(0);
    expect(indexes.some(index => oauthUrls.has(index.url))).toBe(true);
  });

  test('publishes no retired Knowledge Base URLs in search, the sitemap, or the LLM index', async () => {
    const records = await getAlgoliaSearchDocuments();
    const sitemapUrls = (await sitemap()).map(entry => entry.url);
    const llmsIndex = await (await getLlmsIndex()).text();

    expect(records.some(record => /^\/kb(\/|$)/.test(record.canonical_url))).toBe(false);
    expect(sitemapUrls.some(url => /^https:\/\/docs\.composio\.dev\/kb(\/|$)/.test(url))).toBe(false);
    expect(llmsIndex).not.toMatch(/https:\/\/docs\.composio\.dev\/kb[/.)\s]/);
    expect(sitemapUrls.some((url) => url.startsWith('https://composio.dev/auth/'))).toBe(false);
    expect(llmsIndex).not.toContain('https://composio.dev/auth/');
  });
});
