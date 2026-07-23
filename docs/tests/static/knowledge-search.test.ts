import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  algoliaFacetFilters,
  filterLegacyReferenceRecords,
  knowledgeSearchResultFromRecord,
  searchKnowledgeRecords,
} from '@/lib/knowledge/search';
import { GET } from '@/app/api/knowledge-search/route';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';

function record(input: {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  pageRank: number;
  description?: string;
  content?: string;
  keywords?: string[];
}): AlgoliaDocsRecord {
  const canonicalUrl = `/${input.sourceType}/${input.id}`;
  return {
    objectID: input.id,
    title: input.title,
    description: input.description ?? input.title,
    breadcrumbs: ['Knowledge'],
    url: canonicalUrl,
    page_id: canonicalUrl,
    content: input.content ?? input.description ?? input.title,
    keywords: input.keywords ?? [],
    slug: input.id,
    headings: [],
    type: input.sourceType,
    lang: 'en',
    page_rank: input.pageRank,
    toolkit_popularity: 0,
    section_rank: 120,
    position: 0,
    depth: 0,
    source_type: input.sourceType,
    canonical_url: canonicalUrl,
    product_areas: input.sourceType === 'reference' || input.sourceType === 'legacy'
      ? ['sdk-and-api']
      : [],
    toolkit_slugs: [],
    intents: [],
    last_verified_at: input.sourceType === 'kb' ? '2026-07-22' : null,
  };
}

const closeMatchRecords = [
  record({ id: 'docs', title: 'Connected account setup', sourceType: 'docs', pageRank: 2_000 }),
  record({ id: 'kb', title: 'Connected account setup', sourceType: 'kb', pageRank: 1_900 }),
  record({ id: 'oauth', title: 'Connected account setup', sourceType: 'oauth-guide', pageRank: 1_700 }),
  record({ id: 'toolkit', title: 'Connected account setup', sourceType: 'toolkit', pageRank: 1_500 }),
  record({ id: 'example', title: 'Connected account setup', sourceType: 'example', pageRank: 1_300 }),
  record({ id: 'reference', title: 'Connected account setup', sourceType: 'reference', pageRank: 700 }),
  record({ id: 'changelog', title: 'Connected account setup', sourceType: 'changelog', pageRank: 350 }),
  record({ id: 'legacy', title: 'Connected account setup', sourceType: 'legacy', pageRank: 25 }),
];

describe('unified knowledge search', () => {
  test('uses source rank only to break equally relevant close matches', () => {
    const result = searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected account setup',
      filter: 'all',
      limit: 20,
    });

    expect(result.results.map((item) => item.sourceType)).toEqual([
      'docs', 'kb', 'oauth-guide', 'toolkit', 'example', 'reference', 'changelog', 'legacy',
    ]);
  });

  test('lets exact titles, action slugs, and error phrases beat page rank', () => {
    const records = [
      record({
        id: 'generic-doc',
        title: 'Troubleshoot toolkit actions',
        sourceType: 'docs',
        pageRank: 2_400,
        content: 'Calendly and Odoo troubleshooting overview.',
      }),
      record({
        id: 'calendly',
        title: 'Use CALENDLY_POST_INVITEE for invitee creation',
        sourceType: 'kb',
        pageRank: 1_900,
        keywords: ['CALENDLY_POST_INVITEE'],
      }),
      record({
        id: 'odoo',
        title: 'Inspect Odoo JSON-RPC errors inside HTTP 200 responses',
        sourceType: 'kb',
        pageRank: 1_900,
        content: 'The response has HTTP 200 but contains an Odoo JSON-RPC error object.',
      }),
      record({
        id: 'exact-reference',
        title: 'Create a connected account',
        sourceType: 'reference',
        pageRank: 700,
      }),
    ];

    expect(searchKnowledgeRecords(records, {
      query: 'CALENDLY_POST_INVITEE', filter: 'all', limit: 10,
    }).results[0]?.objectID).toBe('calendly');
    expect(searchKnowledgeRecords(records, {
      query: 'HTTP 200 but contains an Odoo JSON-RPC error', filter: 'all', limit: 10,
    }).results[0]?.objectID).toBe('odoo');
    expect(searchKnowledgeRecords(records, {
      query: 'Create a connected account', filter: 'all', limit: 10,
    }).results[0]?.objectID).toBe('exact-reference');
  });

  test('ranks precise new KB answers ahead of generic documentation', async () => {
    const records = await getAlgoliaSearchDocuments();
    const expected = [
      ['NONEXISTENT_VERSION', 'fix-linkedin-426-nonexistent-version'],
      ['admin.conversations:write', 'slack-admin-conversation-writes-require-enterprise'],
      ['Snowflake org-account', 'snowflake-account-id-uses-org-account-format'],
      ['Stripe sk_test secret key', 'stripe-api-key-connections-require-a-secret-key'],
      ['Google Calendar primary not me', 'use-primary-for-google-calendar-id'],
    ] as const;

    for (const [query, slug] of expected) {
      const result = searchKnowledgeRecords(records, { query, filter: 'all', limit: 10 }).results[0];
      expect(result?.sourceType).toBe('kb');
      expect(result?.canonicalUrl).toBe(`/kb/guide/${slug}`);
    }
  });

  test('maps every source filter and keeps examples and changelog in All', () => {
    expect(algoliaFacetFilters('all')).toEqual([]);
    expect(algoliaFacetFilters('docs')).toEqual([['source_type:docs']]);
    expect(algoliaFacetFilters('kb')).toEqual([['source_type:kb']]);
    expect(algoliaFacetFilters('oauth')).toEqual([['source_type:oauth-guide']]);
    expect(algoliaFacetFilters('toolkits')).toEqual([['source_type:toolkit']]);
    expect(algoliaFacetFilters('reference')).toEqual([
      ['source_type:reference', 'source_type:legacy'],
    ]);

    const all = searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected', filter: 'all', limit: 20,
    });
    expect(all.results.some((item) => item.sourceType === 'example')).toBe(true);
    expect(all.results.some((item) => item.sourceType === 'changelog')).toBe(true);
    expect(searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected', filter: 'oauth', limit: 20,
    }).results.every((item) => item.sourceType === 'oauth-guide')).toBe(true);
  });

  test('hides legacy reference unless it is the only exact match', () => {
    const records = [
      record({
        id: 'current-auth', title: 'Authentication reference', sourceType: 'reference', pageRank: 700,
      }),
      record({
        id: 'legacy-token', title: 'Old token endpoint foo_unique', sourceType: 'legacy', pageRank: 25,
      }),
    ];

    expect(searchKnowledgeRecords(records, {
      query: 'reference', filter: 'reference', limit: 20,
    }).results.map((item) => item.objectID)).toEqual(['current-auth']);
    expect(searchKnowledgeRecords(records, {
      query: 'Old token endpoint foo_unique', filter: 'reference', limit: 20,
    }).results.map((item) => item.objectID)).toEqual(['legacy-token']);

    const currentExact = record({
      id: 'current-exact', title: 'Create connected account', sourceType: 'reference', pageRank: 700,
    });
    const legacyExact = record({
      id: 'legacy-exact', title: 'Create connected account', sourceType: 'legacy', pageRank: 25,
    });
    expect(filterLegacyReferenceRecords(
      [legacyExact, currentExact],
      'Create connected account',
      'reference',
    ).map((item) => item.objectID)).toEqual(['current-exact']);
    expect(searchKnowledgeRecords([legacyExact, currentExact], {
      query: 'Create connected account', filter: 'reference', limit: 20,
    }).results.map((item) => item.objectID)).toEqual(['current-exact']);
  });

  test('returns no documents for an empty query', () => {
    expect(searchKnowledgeRecords(closeMatchRecords, {
      query: '   ', filter: 'all', limit: 20,
    })).toEqual({ query: '', filter: 'all', results: [], total: 0 });
  });

  test('does not repeat the source badge as the first breadcrumb', () => {
    const toolkit = record({
      id: 'github', title: 'GitHub', sourceType: 'toolkit', pageRank: 1_500,
    });
    toolkit.breadcrumbs = ['Toolkit', 'Authentication'];
    expect(knowledgeSearchResultFromRecord(toolkit).breadcrumbs).toEqual(['Authentication']);
  });

  test('returns plain-text excerpts from Algolia highlight markup', () => {
    const docs = record({
      id: 'auth', title: 'Authentication', sourceType: 'docs', pageRank: 2_000,
    });
    expect(knowledgeSearchResultFromRecord(
      docs,
      'Use &lt;managed&gt; <mark>OAuth</mark> &amp; API keys.',
    ).excerpt).toBe('Use <managed> OAuth & API keys.');
  });

  test('rejects invalid API filters', async () => {
    const response = await GET(new Request(
      'http://localhost/api/knowledge-search?q=github&filter=invalid',
    ));
    expect(response.status).toBe(400);
  });

  test('configures normalized search facets and retrieval fields', () => {
    const syncSource = readFileSync(
      join(import.meta.dir, '../../scripts/sync-algolia-search.ts'),
      'utf8',
    );
    const retrievalFields = syncSource.slice(
      syncSource.indexOf('attributesToRetrieve:'),
      syncSource.indexOf('searchableAttributes:'),
    );

    for (const field of [
      'source_type', 'canonical_url', 'product_areas', 'toolkit_slugs', 'intents',
      'last_verified_at', 'keywords', 'slug', 'tool_names', 'tool_slugs',
    ]) {
      expect(retrievalFields).toContain(`'${field}'`);
    }
    expect(syncSource).toContain("customRanking: [\n            'desc(page_rank)',\n            'desc(section_rank)',\n          ]");
  });
});
