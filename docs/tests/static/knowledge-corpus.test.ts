import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted && character === '"' && content[index + 1] === '"') {
      cell += character;
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) rows.push([...row, cell]);
  return rows;
}

function readTree(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(root, entry.name);
      if (entry.isDirectory()) return [readTree(file)];
      return entry.isFile() ? [readFileSync(file, 'utf8')] : [];
    })
    .join('\n');
}

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

  test('keeps generated and searchable KB content free of private, obsolete, and held material', async () => {
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
      /\brube\b/i,
      /\bT-\d{2,}\b/,
      /app\.plain\.com/i,
      /slack\.com\/archives\//i,
      /linear\.app\/composio/i,
      /X-Amz-(?:Signature|Credential)/i,
      /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /\bcandidate-only\b/i,
      /^#{2,6}\s+(?:Internal|Support checks|Debug checklist|Related Plain refs)\b/im,
      /(?:draft )?response (?:shape|template)/i,
      /auth-config-list-pages-return-at-most-50-items/i,
    ];

    for (const pattern of forbidden) {
      expect(searchableKb).not.toMatch(pattern);
      expect(generatedKb).not.toMatch(pattern);
    }
  });

  test('keeps every excluded audit candidate out of public KB provenance and search', async () => {
    const auditRows = parseCsv(readFileSync(
      join(process.cwd(), 'kb/audits/2026-07-22-section-audit.csv'),
      'utf8',
    ));
    const [headers, ...rows] = auditRows;
    const indexByHeader = new Map(headers?.map((header, index) => [header, index]));
    const column = (row: string[], header: string) => row[indexByHeader.get(header) ?? -1] ?? '';
    const excluded = rows.filter((row) => column(row, 'state') === 'exclude').map((row) => ({
      sourcePath: column(row, 'source_paths'),
      sourceHeading: column(row, 'source_headings'),
      title: column(row, 'proposed_title'),
    }));
    const records = await getAlgoliaSearchDocuments();
    const kbRecords = records.filter((record) => record.source_type === 'kb');
    const generatedKb = readTree(join(process.cwd(), 'content/kb'));

    expect(excluded).toHaveLength(5);
    for (const candidate of excluded) {
      const provenance = JSON.stringify({
        sourcePath: candidate.sourcePath,
        sourceHeading: candidate.sourceHeading,
      });
      const routeFragment = candidate.sourcePath.split('/').at(-2)!;
      expect(generatedKb).not.toContain(provenance);
      expect(kbRecords.some((record) => record.title === candidate.title)).toBe(false);
      expect(kbRecords.some((record) => record.canonical_url.includes(routeFragment))).toBe(false);
    }
  });
});
