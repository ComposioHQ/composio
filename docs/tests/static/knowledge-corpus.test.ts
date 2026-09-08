import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import sitemap from '@/app/sitemap';
import { GET as getLlmsIndex } from '@/app/llms.txt/route';
import { getAlgoliaSearchDocuments, getDocsSearchIndexes } from '@/lib/search-index';
import * as searchIndexModule from '@/lib/search-index';
import { getLocalKnowledgeDiscoveryPaths } from '@/lib/knowledge/discovery';
import { getPublishedKbGuides } from '@/lib/kb/repository';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';
import type { KbManifest } from '@/lib/kb/types';

const REQUIRED_PUBLIC_SOURCES: KnowledgeSourceType[] = [
  'docs',
  'kb',
  'oauth-guide',
  'toolkit',
  'example',
  'reference',
  'changelog',
];

function readTree(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(root, entry.name);
      if (entry.isDirectory()) return [readTree(file)];
      return entry.isFile() ? [readFileSync(file, 'utf8')] : [];
    })
    .join('\n');
}

function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
    .sort();
}

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

  test('discovers local hub and browse routes without duplicating external OAuth pages', async () => {
    const paths = await getLocalKnowledgeDiscoveryPaths();
    const guide = getPublishedKbGuides()[0];
    expect(guide).toBeDefined();
    expect(paths).toContain('/kb');
    expect(paths).toContain('/kb/search');
    expect(paths).toContain('/kb/topic/authentication-and-connected-accounts');
    expect(paths).toContain('/kb/toolkits');
    expect(paths.some(path => path.startsWith('/kb/toolkit/'))).toBe(true);
    expect(paths).toContain(`/kb/guide/${guide!.slug}`);
    expect(paths.some((path) => path.startsWith('https://composio.dev/auth/'))).toBe(false);

    const sitemapUrls = (await sitemap()).map((entry) => entry.url);
    for (const path of paths.filter(path => path !== '/kb/search')) {
      expect(sitemapUrls).toContain(`https://docs.composio.dev${path}`);
    }
    expect(sitemapUrls).not.toContain('https://docs.composio.dev/kb/search');
    expect(sitemapUrls.some((url) => url.startsWith('https://composio.dev/auth/'))).toBe(false);
  });

  test('publishes flat guide and browse routes in the LLM index', async () => {
    const response = await getLlmsIndex();
    const body = await response.text();
    const guide = getPublishedKbGuides()[0];
    expect(guide).toBeDefined();
    expect(body).toContain('https://docs.composio.dev/kb');
    expect(body).toContain('https://docs.composio.dev/kb/toolkits');
    expect(body).toMatch(/https:\/\/docs\.composio\.dev\/kb\/toolkit\/[^\s]+/);
    expect(body).toContain(`https://docs.composio.dev/kb/guide/${guide!.slug}.md`);
    expect(body).not.toContain('https://composio.dev/auth/');
  });

  test('keeps generated and searchable KB content free of internal-only markers', async () => {
    const records = await getAlgoliaSearchDocuments();
    const searchableKb = records
      .filter((record) => record.source_type === 'kb')
      .map((record) => [
        record.title,
        record.description,
        record.canonical_url,
        record.content,
        ...(record.keywords ?? []),
        ...(record.headings ?? []),
      ].filter(Boolean).join('\n'))
      .join('\n');
    const generatedKb = readTree(join(process.cwd(), 'content/kb'));
    const forbidden = [
      /\bT-\d{2,}\b/,
      /app\.plain\.com/i,
      /slack\.com\/archives\//i,
      /linear\.app\/composio/i,
      /X-Amz-(?:Signature|Credential)/i,
      /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/,
      /\bcandidate-only\b/i,
      /^#{2,6}\s+(?:Internal|Support checks|Debug checklist|Related Plain refs)\b/im,
      /(?:draft )?response (?:shape|template)/i,
    ];

    for (const pattern of forbidden) {
      expect(searchableKb).not.toMatch(pattern);
      expect(generatedKb).not.toMatch(pattern);
    }
  });

  test('publishes every file in the reconciled public snapshot exactly once', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'kb/manifest.json'), 'utf8'),
    ) as KbManifest;
    const snapshotFiles = listFiles(join(process.cwd(), 'kb/source'));
    const guideSourcePaths = [...new Set(
      manifest.guides.flatMap(guide => guide.sources.map(source => source.sourcePath)),
    )].sort();

    expect(manifest.guides.every(guide => guide.state === 'published')).toBe(true);
    expect(guideSourcePaths).toEqual(snapshotFiles);
  });
});
