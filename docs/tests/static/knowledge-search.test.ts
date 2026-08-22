import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  algoliaFacetFilters,
  filterLegacyReferenceRecords,
  knowledgeSearchResultFromRecord,
  plainKnowledgeExcerpt,
  searchKnowledgeRecords,
} from '@/lib/knowledge/search';
import { createKnowledgeSearchHandler, GET } from '@/app/api/knowledge-search/route';
import { searchPublicKnowledge } from '@/lib/knowledge/search-service';
import * as searchServiceModule from '@/lib/knowledge/search-service';
import {
  isStrongLexicalCandidate,
  publicKbCandidateFromAlgolia,
  publicKnowledgeCandidateFromSearchRecord,
} from '@/lib/knowledge/hybrid-search';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';

const REPO_ROOT = join(import.meta.dir, '../../..');
const UNIFIED_SEARCH_ENDPOINT = 'https://docs.composio.dev/api/knowledge-search?q=<question>';
const PUBLIC_COMPOSIO_SKILL_SOURCES = [
  join(REPO_ROOT, 'skills/composio/SKILL.md'),
  join(REPO_ROOT, 'skills/composio/references/for-you.md'),
];
const SEPARATE_SUPPORT_SKILL = join(REPO_ROOT, 'skills/composio-support');
const PRIMARY_SOURCES = /\bcurrent\b[\s\S]{0,120}\b(?:documentation|docs)\b[\s\S]{0,160}\bCLI\b[\s\S]{0,80}\btool schemas\b[\s\S]{0,100}\bprimary\b/i;
const PUBLIC_RESULT_BREADTH = /\bcanonical docs\b[\s\S]{0,80}\bKB\b[\s\S]{0,80}\btoolkit\b[\s\S]{0,80}\bexample\b[\s\S]{0,80}\breference pages\b/i;
const NO_LIVE_STATE_INFERENCE = /\b(?:do not|does not|cannot|never)\b[\s\S]{0,120}\b(?:infer|establish)\b[\s\S]{0,120}\blive state\b/i;

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
      ? ['sdk-api-and-mcp']
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

describe('public Composio unified support routing', () => {
  test('uses unified public search only after primary sources and grounds answers in public evidence', () => {
    expect(existsSync(SEPARATE_SUPPORT_SKILL)).toBe(false);

    for (const sourceFile of PUBLIC_COMPOSIO_SKILL_SOURCES) {
      const source = readFileSync(sourceFile, 'utf8');
      const primarySourcesIndex = source.search(PRIMARY_SOURCES);
      const unifiedSearchIndex = source.indexOf(UNIFIED_SEARCH_ENDPOINT);

      expect(source).toContain(UNIFIED_SEARCH_ENDPOINT);
      expect(source).not.toContain('filter=kb');
      expect(source).not.toMatch(/\bcomposio-support\b/i);
      expect(primarySourcesIndex).toBeGreaterThanOrEqual(0);
      expect(primarySourcesIndex).toBeLessThan(unifiedSearchIndex);
      expect(source).toMatch(PUBLIC_RESULT_BREADTH);
      expect(source).toMatch(/\breturned evidence\b/i);
      expect(source).toMatch(NO_LIVE_STATE_INFERENCE);
      expect(source).toMatch(/\baccount\b/i);
      expect(source).toMatch(/\bconnection\b/i);
      expect(source).toMatch(/\btool call\b/i);
    }
  });
});

describe('plain knowledge excerpts', () => {
  test('removes an unterminated HTML opener instead of returning active markup', () => {
    expect(plainKnowledgeExcerpt('Safe text <script alert(1)')).toBe('Safe text');
  });

  test('removes entity-encoded markup before returning plain text', () => {
    expect(plainKnowledgeExcerpt('&lt;script&gt;alert(1)&lt;/script&gt; trailing'))
      .toBe('alert(1) trailing');
  });

  test('preserves comparison prose and angle-bracket placeholders', () => {
    expect(plainKnowledgeExcerpt('Retry if latency < 500ms and depth > 2.'))
      .toBe('Retry if latency < 500ms and depth > 2.');
    expect(plainKnowledgeExcerpt('Send x-api-key: <key> and retry on 429.'))
      .toBe('Send x-api-key: <key> and retry on 429.');
  });

  test('removes legacy and attribute-bearing HTML without consuming placeholders', () => {
    expect(plainKnowledgeExcerpt('<image src=x onerror=alert(1)> caption')).toBe('caption');
    expect(plainKnowledgeExcerpt('&lt;marquee onstart=alert(1)&gt;notice&lt;/marquee&gt; after'))
      .toBe('notice after');
    expect(plainKnowledgeExcerpt('<custom-element data-state=active>value</custom-element> tail'))
      .toBe('value tail');
    expect(plainKnowledgeExcerpt('Use <external-user-id> and <API key> placeholders.'))
      .toBe('Use <external-user-id> and <API key> placeholders.');
  });

  test('sanitizes the record fallback excerpt as well as highlighted excerpts', () => {
    const guide = record({
      id: 'safe-fallback',
      title: 'Safe fallback',
      sourceType: 'kb',
      pageRank: 1_900,
      description: '&lt;em&gt;Reconnect&lt;/em&gt; the account.',
    });

    expect(knowledgeSearchResultFromRecord(guide).excerpt).toBe('Reconnect the account.');
  });
});

describe('unified knowledge search', () => {
  test('normalizes pre-migration Algolia hits across trustworthy type and path mappings', () => {
    const normalizeAlgoliaSearchHits = (
      searchServiceModule as {
        normalizeAlgoliaSearchHits?: (hits: unknown[]) => AlgoliaDocsRecord[];
      }
    ).normalizeAlgoliaSearchHits;
    expect(typeof normalizeAlgoliaSearchHits).toBe('function');
    if (!normalizeAlgoliaSearchHits) return;

    const normalized = normalizeAlgoliaSearchHits([
      {
        objectID: 'legacy-docs',
        title: 'Configure sessions',
        description: 'Configure a session.',
        content: 'Configure a session with the SDK.',
        url: '/docs/configuring-sessions#overview',
        page_id: '/docs/configuring-sessions',
        type: 'docs',
      },
      {
        objectID: 'legacy-toolkit',
        title: 'GitHub',
        content: 'GitHub tools.',
        url: '/toolkits/github',
        page_id: '/toolkits/github',
        type: 'toolkits',
      },
      {
        objectID: 'legacy-reference',
        title: 'List tools',
        content: 'List tools reference.',
        url: '/reference/api-reference/tools/getTools',
        page_id: '/reference/api-reference/tools/getTools',
        type: 'api-reference',
      },
      {
        objectID: 'path-mapped-toolkit',
        title: 'Slack',
        content: 'Slack tools.',
        url: '/toolkits/slack',
        page_id: '/toolkits/slack',
        type: 'unknown',
      },
      {
        objectID: 'stale-toolkit',
        title: 'Removed toolkit',
        content: 'This toolkit was removed from the current public catalog.',
        url: '/toolkits/removed_toolkit',
        type: 'toolkits',
      },
      {
        objectID: 'hidden-auth-operation',
        title: 'Get current session',
        content: 'Internal session lookup.',
        url: '/reference/api-reference/authentication/getAuthSessionInfo',
        page_id: '/reference/api-reference/authentication/getAuthSessionInfo',
        type: 'api-reference',
      },
    ]);

    expect(normalized.map((record) => ({
      objectID: record.objectID,
      sourceType: record.source_type,
      canonicalUrl: record.canonical_url,
    }))).toEqual([
      {
        objectID: 'legacy-docs',
        sourceType: 'docs',
        canonicalUrl: '/docs/configuring-sessions',
      },
      {
        objectID: 'legacy-toolkit',
        sourceType: 'toolkit',
        canonicalUrl: '/toolkits/github',
      },
      {
        objectID: 'legacy-reference',
        sourceType: 'reference',
        canonicalUrl: '/reference/api-reference/tools/getTools',
      },
      {
        objectID: 'path-mapped-toolkit',
        sourceType: 'toolkit',
        canonicalUrl: '/toolkits/slack',
      },
    ]);
  });

  test('accepts an empty Algolia result but rejects a non-empty all-invalid result', () => {
    const normalizeAlgoliaSearchHits = (
      searchServiceModule as {
        normalizeAlgoliaSearchHits?: (hits: unknown[]) => AlgoliaDocsRecord[];
      }
    ).normalizeAlgoliaSearchHits;
    expect(typeof normalizeAlgoliaSearchHits).toBe('function');
    if (!normalizeAlgoliaSearchHits) return;

    expect(normalizeAlgoliaSearchHits([])).toEqual([]);
    expect(() => normalizeAlgoliaSearchHits([
      { objectID: 'missing-route', title: 'No public route', type: 'docs' },
      { objectID: 'unclassified', title: 'Unknown source', url: '/unknown', type: 'unknown' },
    ])).toThrow('keyword-request-failed');
  });

  test('preserves every public source type in keyword candidates and reserves strong lexical matches for exact identities', () => {
    const calendly = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'calendly',
      title: 'Calendly actions',
      sourceType: 'toolkit',
      pageRank: 1_500,
      keywords: ['CALENDLY_POST_INVITEE'],
    }));
    const claudeDocs = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'claude-connect',
      title: 'Connect Claude',
      sourceType: 'docs',
      pageRank: 2_000,
      content: 'Learn how do I connect Claude to Composio from this guide.',
    }));
    const reference = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'reference', title: 'API reference', sourceType: 'reference', pageRank: 700,
    }));
    const exactTitle = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'exact-title', title: 'Create Connected Account', sourceType: 'docs', pageRank: 2_000,
    }));
    const toolSlugRecord = record({
      id: 'tool-slug', title: 'Calendly actions', sourceType: 'toolkit', pageRank: 1_500,
    });
    toolSlugRecord.tool_slugs = ['CALENDLY_POST_INVITEE'];
    const toolSlug = publicKnowledgeCandidateFromSearchRecord(toolSlugRecord);

    expect(calendly).toMatchObject({ sourceType: 'toolkit', sourceLabel: 'Toolkit' });
    expect(claudeDocs).toMatchObject({ sourceType: 'docs', sourceLabel: 'Docs' });
    expect(reference).toMatchObject({ sourceType: 'reference', sourceLabel: 'Reference' });
    expect(isStrongLexicalCandidate(exactTitle, '  create connected account  ')).toBe(true);
    expect(isStrongLexicalCandidate(calendly, 'CALENDLY_POST_INVITEE')).toBe(true);
    expect(isStrongLexicalCandidate(calendly, 'calendly')).toBe(true);
    expect(isStrongLexicalCandidate(toolSlug, 'CALENDLY_POST_INVITEE')).toBe(true);
    expect(isStrongLexicalCandidate(claudeDocs, 'how do I connect claude')).toBe(false);
  });

  test('uses source rank only to break equally relevant close matches', () => {
    const result = searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected account setup',
      filter: 'all',
      limit: 20,
    });

    expect(result.results.map((item) => item.sourceType)).toEqual([
      'docs', 'kb', 'oauth-guide', 'toolkit', 'example', 'reference', 'changelog',
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

  test('maps every source filter and keeps examples and changelog in All', () => {
    expect(algoliaFacetFilters('all')).toEqual([]);
    expect(algoliaFacetFilters('docs')).toEqual([['source_type:docs']]);
    expect(algoliaFacetFilters('kb')).toEqual([['source_type:kb']]);
    expect(algoliaFacetFilters('oauth')).toEqual([['source_type:oauth-guide']]);
    expect(algoliaFacetFilters('toolkit')).toEqual([['source_type:toolkit']]);
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

  test('does not let incidental stop-word matches outrank a meaningful partial match', () => {
    const records = [
      record({
        id: 'generic',
        title: 'Audit data handling',
        sourceType: 'kb',
        pageRank: 2_400,
        content: 'The audit row is retained when data storage is disabled.',
      }),
      record({
        id: 'calendar',
        title: 'Google Calendar troubleshooting',
        sourceType: 'kb',
        pageRank: 1_900,
        content: 'Use primary when the signed-in user alias fails as a calendar ID.',
      }),
    ];

    expect(searchKnowledgeRecords(records, {
      query: 'Why does the signed-in user alias fail when I pass it as a calendar id?',
      filter: 'kb',
      limit: 20,
    }).results[0]?.objectID).toBe('calendar');
    expect(searchKnowledgeRecords(records, {
      query: 'the and when does it',
      filter: 'kb',
      limit: 20,
    }).results).toEqual([]);
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

  test('removes markdown decoration from result excerpts', () => {
    const guide = record({
      id: 'oauth', title: 'OAuth setup', sourceType: 'kb', pageRank: 1_900,
    });

    expect(knowledgeSearchResultFromRecord(
      guide,
      '# Create an auth config\n\nUse **custom OAuth** credentials from `GitHub`.',
    ).excerpt).toBe('Create an auth config Use custom OAuth credentials from GitHub.');
  });

  test('rejects invalid API filters', async () => {
    const response = await GET(new Request(
      'http://localhost/api/knowledge-search?q=github&filter=invalid',
    ));
    expect(response.status).toBe(400);
  });

  test('returns fused public KB results with provider-neutral retrieval metadata', async () => {
    const github = publicKbCandidateFromAlgolia(record({
      id: 'github-answer',
      title: 'Reconnect GitHub',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const oauth = publicKbCandidateFromAlgolia(record({
      id: 'oauth-answer',
      title: 'Refresh OAuth access',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [github, oauth] }),
      searchSemanticCandidates: async () => [oauth, github],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=revoked+access&filter=kb',
    ));
    const body = await response.json() as {
      mode: string;
      results: Array<{ objectID: string; sourceType: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.mode).toBe('hybrid');
    expect(body.results.map(result => result.objectID)).toEqual(['github-answer', 'oauth-answer']);
    expect(body.results.every(result => result.sourceType === 'kb')).toBe(true);
  });

  test('removes markdown decoration from hybrid result excerpts', async () => {
    const github = publicKbCandidateFromAlgolia(record({
      id: 'github-oauth',
      title: 'Configure GitHub OAuth',
      sourceType: 'kb',
      pageRank: 1_900,
      content: '# Create an auth config\n\nUse **custom OAuth** credentials from `GitHub`.',
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [github] }),
      searchSemanticCandidates: async () => [github],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=github+oauth&filter=kb',
    ));
    const body = await response.json() as {
      results: Array<{ excerpt: string }>;
    };

    expect(body.results[0]?.excerpt).toBe(
      'Create an auth config Use custom OAuth credentials from GitHub.',
    );
  });

  test('abstains when hybrid retrieval has neither semantic nor exact keyword evidence', async () => {
    const incidentalKeywordMatch = publicKbCandidateFromAlgolia(record({
      id: 'incidental',
      title: 'Operational health checks',
      sourceType: 'kb',
      pageRank: 1_900,
      content: 'A generic page sharing only incidental words with the query.',
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [incidentalKeywordMatch] }),
      searchSemanticCandidates: async () => [],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=unrelated+request&filter=kb',
    ));
    const body = await response.json() as {
      strongMatch?: boolean;
      total: number;
      results: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.strongMatch).toBe(false);
    expect(body.total).toBe(0);
    expect(body.results).toEqual([]);
  });

  test('keeps an exact keyword identity when semantic retrieval abstains', async () => {
    const exactKeywordMatch = publicKbCandidateFromAlgolia(record({
      id: 'exact-identifier',
      title: 'Action troubleshooting',
      sourceType: 'kb',
      pageRank: 1_900,
      keywords: ['EXACT_ACTION_IDENTIFIER'],
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [exactKeywordMatch] }),
      searchSemanticCandidates: async () => [],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=EXACT_ACTION_IDENTIFIER&filter=kb',
    ));
    const body = await response.json() as {
      strongMatch?: boolean;
      results: Array<{ objectID: string }>;
    };

    expect(body.strongMatch).toBe(true);
    expect(body.results.map(result => result.objectID)).toEqual(['exact-identifier']);
  });

  test('allows a cold semantic request to finish without degrading', async () => {
    const answer = publicKbCandidateFromAlgolia(record({
      id: 'cold-answer',
      title: 'Cold-start answer',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [answer] }),
      searchSemanticCandidates: async () => {
        await new Promise(resolve => setTimeout(resolve, 2_200));
        return [answer];
      },
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=why+is+cold+startup+slow&filter=kb',
    ));
    const body = await response.json() as { mode: string };

    expect(body.mode).toBe('hybrid');
  });

  test('uses either available retriever without exposing its peer failure', async () => {
    const answer = publicKbCandidateFromAlgolia(record({
      id: 'answer',
      title: 'Known answer',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const semanticFailure = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [answer] }),
      searchSemanticCandidates: async () => {
        throw new Error('semantic-request-failed');
      },
    });
    const keywordFailure = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => {
        throw new Error('keyword-request-failed');
      },
      searchSemanticCandidates: async () => [answer],
    });
    const bothFail = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => {
        throw new Error('keyword-request-failed');
      },
      searchSemanticCandidates: async () => {
        throw new Error('semantic-request-failed');
      },
    });
    const request = () => new Request(
      'http://localhost/api/knowledge-search?q=known+answer&filter=kb',
    );

    const keywordResponse = await (await semanticFailure(request())).json() as Record<string, unknown>;
    expect(keywordResponse).toMatchObject({ mode: 'keyword' });
    expect(keywordResponse).not.toHaveProperty('degradedReason');

    const semanticResponse = await (await keywordFailure(request())).json() as Record<string, unknown>;
    expect(semanticResponse).toMatchObject({ mode: 'semantic' });
    expect(semanticResponse).not.toHaveProperty('degradedReason');
    expect((await bothFail(request())).status).toBe(503);
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

describe('public knowledge search service', () => {
  test('falls back to the full local corpus when every Algolia hit is invalid', async () => {
    const normalizeAlgoliaSearchHits = (
      searchServiceModule as {
        normalizeAlgoliaSearchHits?: (hits: unknown[]) => AlgoliaDocsRecord[];
      }
    ).normalizeAlgoliaSearchHits;
    expect(typeof normalizeAlgoliaSearchHits).toBe('function');
    if (!normalizeAlgoliaSearchHits) return;

    const toolkit = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'calendar-toolkit', title: 'Calendar toolkit', sourceType: 'toolkit', pageRank: 1_500,
    }));
    const reference = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'sessions-reference', title: 'Sessions reference', sourceType: 'reference', pageRank: 700,
    }));

    const execution = await searchPublicKnowledge({
      query: 'sessions', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => ({
        candidates: normalizeAlgoliaSearchHits([
          { objectID: 'invalid', title: 'Invalid', type: 'unknown', url: '/unknown' },
        ]).map(publicKnowledgeCandidateFromSearchRecord),
      }),
      searchSemanticCandidates: async () => [],
      searchLocalCandidates: async () => [toolkit, reference],
      previewOverlayEnabled: () => false,
    });

    expect(execution.status).toBe(200);
    expect(execution.response).toMatchObject({
      mode: 'keyword',
      results: [
        { objectID: 'calendar-toolkit', sourceType: 'toolkit' },
        { objectID: 'sessions-reference', sourceType: 'reference' },
      ],
    });
  });

  test('uses normalized legacy canonical URLs for preview replacement only in preview', async () => {
    const normalizeAlgoliaSearchHits = (
      searchServiceModule as {
        normalizeAlgoliaSearchHits?: (hits: unknown[]) => AlgoliaDocsRecord[];
      }
    ).normalizeAlgoliaSearchHits;
    expect(typeof normalizeAlgoliaSearchHits).toBe('function');
    if (!normalizeAlgoliaSearchHits) return;

    const [legacyRecord] = normalizeAlgoliaSearchHits([{
      objectID: 'legacy-doc',
      title: 'Deployed title',
      content: 'Deployed content.',
      url: '/docs/configuring-sessions#overview',
      page_id: '/docs/configuring-sessions',
      type: 'docs',
    }]);
    expect(legacyRecord).toBeDefined();
    const shared = publicKnowledgeCandidateFromSearchRecord(legacyRecord!);
    const branchRecord = record({
      id: 'branch-doc', title: 'Branch-current title', sourceType: 'docs', pageRank: 2_000,
    });
    branchRecord.url = '/docs/configuring-sessions';
    branchRecord.canonical_url = '/docs/configuring-sessions';
    const branch = publicKnowledgeCandidateFromSearchRecord(branchRecord);
    const dependencies = (preview: boolean) => ({
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => ({ candidates: [shared] }),
      searchSemanticCandidates: async () => [],
      searchPreviewCandidates: async () => [branch],
      previewOverlayEnabled: () => preview,
    });

    const preview = await searchPublicKnowledge(
      { query: 'sessions', filter: 'all', headers: new Headers() },
      dependencies(true),
    );
    const production = await searchPublicKnowledge(
      { query: 'sessions', filter: 'all', headers: new Headers() },
      dependencies(false),
    );

    expect(preview.response).toMatchObject({ results: [{ title: 'Branch-current title' }] });
    expect(production.response).toMatchObject({ results: [{ title: 'Deployed title' }] });
  });

  test('returns a full-corpus exact action result before semantic retrieval', async () => {
    const action = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'create-invitee',
      title: 'Create invitee',
      sourceType: 'reference',
      pageRank: 700,
      keywords: ['CALENDLY_POST_INVITEE'],
    }));
    let semanticCalls = 0;
    let keywordFilter = '';

    const execution = await searchPublicKnowledge({
      query: 'CALENDLY_POST_INVITEE',
      filter: 'all',
      headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async (_query, filter) => {
        keywordFilter = filter;
        return { candidates: [action] };
      },
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [];
      },
      searchLocalCandidates: async () => [],
      previewOverlayEnabled: () => false,
    });

    expect(execution.status).toBe(200);
    expect(keywordFilter).toBe('all');
    expect(semanticCalls).toBe(0);
    expect(execution.response).toMatchObject({
      filter: 'all',
      mode: 'keyword',
      strongMatch: true,
      results: [{ sourceType: 'reference' }],
    });
    expect(execution.timings.semanticDurationMs).toBeNull();
  });

  test('promotes exact page identities above incidental body matches', async () => {
    const candidates = [
      record({
        id: 'gmail-toolkit',
        title: 'Gmail',
        sourceType: 'toolkit',
        pageRank: 1_500,
      }),
      record({
        id: 'configuring-sessions',
        title: 'Configuring Sessions',
        sourceType: 'docs',
        pageRank: 2_000,
        content: 'Use toolkits=["github", "gmail", "slack"] when creating a session.',
      }),
      record({
        id: 'shared-connections',
        title: 'Shared connections',
        sourceType: 'docs',
        pageRank: 2_000,
        content: 'Create a shared Gmail connection that any user can use.',
      }),
      record({
        id: 'gmail-kb',
        title: 'Gmail',
        sourceType: 'kb',
        pageRank: 1_900,
      }),
    ].map(publicKnowledgeCandidateFromSearchRecord);
    let semanticCalls = 0;

    const execution = await searchPublicKnowledge({
      query: 'gmail', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates }),
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [];
      },
      previewOverlayEnabled: () => false,
    });

    const results = 'results' in execution.response ? execution.response.results : [];
    expect(semanticCalls).toBe(0);
    expect(results.map(result => result.objectID)).toEqual([
      'gmail-toolkit',
      'gmail-kb',
      'configuring-sessions',
      'shared-connections',
    ]);
  });

  test('deduplicates exact keyword section chunks before returning results', async () => {
    const gmailSections = Array.from({ length: 20 }, (_, index) => {
      const section = record({
        id: index === 0 ? 'gmail-attachments' : `gmail-section-${index}`,
        title: 'Gmail',
        sourceType: 'kb',
        pageRank: 1_900,
        content: index === 0
          ? 'Send attachments safely with Gmail.'
          : `Gmail support section ${index}.`,
      });
      section.url = '/kb/guide/toolkits-gmail';
      section.page_id = '/kb/guide/toolkits-gmail';
      section.canonical_url = '/kb/guide/toolkits-gmail';
      section.section = index === 0 ? 'Send attachments safely' : `Gmail section ${index}`;
      return publicKnowledgeCandidateFromSearchRecord(section);
    });

    const toolkit = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'gmail',
      title: 'Gmail',
      sourceType: 'toolkit',
      pageRank: 1_500,
    }));
    let semanticCalls = 0;

    const execution = await searchPublicKnowledge({
      query: 'gmail', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({
        candidates: gmailSections.concat(toolkit),
      }),
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [];
      },
      previewOverlayEnabled: () => false,
    });

    const results = 'results' in execution.response ? execution.response.results : [];
    expect(semanticCalls).toBe(0);
    expect(results.map(result => result.objectID)).toEqual(['gmail-attachments', 'gmail']);
    expect(new Set(results.map(result => result.canonicalUrl)).size).toBe(results.length);
  });

  test('deduplicates section chunks when hybrid retrieval is disabled', async () => {
    const attachmentsRecord = record({
      id: 'gmail-attachments',
      title: 'Gmail',
      sourceType: 'kb',
      pageRank: 1_900,
      content: 'Use Gmail attachments safely.',
    });
    attachmentsRecord.url = '/kb/guide/toolkits-gmail';
    attachmentsRecord.page_id = '/kb/guide/toolkits-gmail';
    attachmentsRecord.canonical_url = '/kb/guide/toolkits-gmail';
    attachmentsRecord.section = 'Send attachments safely';

    const oauthRecord = record({
      id: 'gmail-oauth',
      title: 'Gmail',
      sourceType: 'kb',
      pageRank: 1_900,
      content: 'Configure Gmail OAuth scopes.',
    });
    oauthRecord.url = '/kb/guide/toolkits-gmail';
    oauthRecord.page_id = '/kb/guide/toolkits-gmail';
    oauthRecord.canonical_url = '/kb/guide/toolkits-gmail';
    oauthRecord.section = 'Configure Gmail OAuth';

    const execution = await searchPublicKnowledge({
      query: 'gmail attachments', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => ({
        candidates: [attachmentsRecord, oauthRecord]
          .map(publicKnowledgeCandidateFromSearchRecord),
      }),
      searchSemanticCandidates: async () => [],
      previewOverlayEnabled: () => false,
    });

    const results = 'results' in execution.response ? execution.response.results : [];
    expect(results.map(result => result.objectID)).toEqual(['gmail-attachments']);
    expect(new Set(results.map(result => result.canonicalUrl)).size).toBe(results.length);
  });

  test('fuses docs and KB semantics with toolkit and reference keyword candidates', async () => {
    const toolkit = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'calendar-toolkit', title: 'Calendar tools', sourceType: 'toolkit', pageRank: 1_500,
    }));
    const reference = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'sessions-reference', title: 'Sessions API', sourceType: 'reference', pageRank: 700,
    }));
    const docs = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'sessions-docs', title: 'Configure sessions', sourceType: 'docs', pageRank: 2_000,
    }));
    const kb = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'calendar-kb', title: 'Repair calendar authorization', sourceType: 'kb', pageRank: 1_900,
    }));
    let semanticCalls = 0;

    const execution = await searchPublicKnowledge({
      query: 'why did my calendar connection stop working',
      filter: 'all',
      headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [toolkit, reference] }),
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [docs, kb];
      },
      searchLocalCandidates: async () => [],
      previewOverlayEnabled: () => false,
    });

    expect(semanticCalls).toBe(1);
    expect(execution.response).toMatchObject({ mode: 'hybrid', strongMatch: true });
    expect('results' in execution.response
      ? execution.response.results.map(result => result.sourceType)
      : []).toEqual(['docs', 'toolkit', 'kb', 'reference']);
    expect(execution.timings.semanticDurationMs).not.toBeNull();
  });

  test('keeps legacy reference exact-only across the unified corpus', async () => {
    const current = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'current', title: 'Create connected account', sourceType: 'reference', pageRank: 700,
    }));
    const legacy = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'legacy', title: 'Create connected account', sourceType: 'legacy', pageRank: 25,
    }));
    const weakLegacy = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'legacy-weak', title: 'Old create account guide', sourceType: 'legacy', pageRank: 25,
      content: 'Create connected account with the old endpoint.',
    }));
    const dependencies = {
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => ({ candidates: [legacy, current, weakLegacy] }),
      searchSemanticCandidates: async () => [],
      searchLocalCandidates: async () => [],
      previewOverlayEnabled: () => false,
    };

    const currentExecution = await searchPublicKnowledge({
      query: 'Create connected account', filter: 'all', headers: new Headers(),
    }, dependencies);
    expect('results' in currentExecution.response
      ? currentExecution.response.results.map(result => result.objectID)
      : []).toEqual(['current']);

    const weakExecution = await searchPublicKnowledge({
      query: 'create account', filter: 'all', headers: new Headers(),
    }, dependencies);
    expect('results' in weakExecution.response
      ? weakExecution.response.results.some(result => result.sourceType === 'legacy')
      : true).toBe(false);
  });

  test('uses the full local public corpus when shared keyword retrieval fails', async () => {
    const local = closeMatchRecords
      .filter(item => item.source_type !== 'legacy')
      .map(publicKnowledgeCandidateFromSearchRecord);
    const events: Array<{ degradationCategory: string | null; retrievalMode: string }> = [];

    const execution = await searchPublicKnowledge({
      query: 'connected account setup', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => { throw new Error('keyword-request-failed'); },
      searchSemanticCandidates: async () => { throw new Error('semantic-request-failed'); },
      searchLocalCandidates: async () => local,
      previewOverlayEnabled: () => false,
      captureSearch: event => events.push(event),
    });

    expect(execution.status).toBe(200);
    expect('results' in execution.response
      ? execution.response.results.map(result => result.sourceType)
      : []).toEqual([
      'docs', 'kb', 'oauth-guide', 'toolkit', 'example', 'reference', 'changelog',
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      degradationCategory: 'keyword-request-failed',
      retrievalMode: 'keyword',
    });
  });

  test('overlays branch-local docs in preview and disables the overlay in production', async () => {
    const shared = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'shared-doc', title: 'Shared title', sourceType: 'docs', pageRank: 2_000,
    }));
    const branchRecord = record({
      id: 'branch-doc', title: 'Branch-current title', sourceType: 'docs', pageRank: 2_000,
    });
    branchRecord.canonical_url = shared.canonicalUrl;
    branchRecord.url = shared.canonicalUrl;
    const branch = publicKnowledgeCandidateFromSearchRecord(branchRecord);
    let localCalls = 0;
    const dependencies = (preview: boolean) => ({
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => ({ candidates: [shared] }),
      searchSemanticCandidates: async () => [],
      searchPreviewCandidates: async () => {
        localCalls += 1;
        return [branch];
      },
      previewOverlayEnabled: () => preview,
    });

    const preview = await searchPublicKnowledge({
      query: 'Branch-current title', filter: 'all', headers: new Headers(),
    }, dependencies(true));
    expect(preview.response).toMatchObject({ results: [{ title: 'Branch-current title' }] });
    expect(preview.previewOverlayApplied).toBe(true);

    const production = await searchPublicKnowledge({
      query: 'Shared title', filter: 'all', headers: new Headers(),
    }, dependencies(false));
    expect(production.response).toMatchObject({ results: [{ title: 'Shared title' }] });
    expect(production.previewOverlayApplied).toBe(false);
    expect(localCalls).toBe(1);
  });

  test('removes a stale shared docs hit when the branch-local page no longer matches', async () => {
    const shared = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'stale-doc', title: 'Removed setup wording', sourceType: 'docs', pageRank: 2_000,
    }));

    const execution = await searchPublicKnowledge({
      query: 'Removed setup wording', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => false,
      searchKeywordCandidates: async () => ({ candidates: [shared] }),
      searchSemanticCandidates: async () => [],
      searchPreviewCandidates: async () => ({
        candidates: [],
        canonicalUrls: [shared.canonicalUrl],
      }),
      previewOverlayEnabled: () => true,
    });

    expect(execution.response).toMatchObject({ mode: 'keyword', results: [] });
    expect(execution.previewOverlayApplied).toBe(true);
  });

  test('does not let a weak preview record hide a strong shared identity match', async () => {
    const exact = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'exact-reference', title: 'Calendly action', sourceType: 'reference', pageRank: 700,
      keywords: ['CALENDLY_POST_INVITEE'],
    }));
    const weakLocal = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'local-doc', title: 'Calendly overview', sourceType: 'docs', pageRank: 2_000,
      content: 'Learn about Calendly actions.',
    }));
    let semanticCalls = 0;

    const execution = await searchPublicKnowledge({
      query: 'CALENDLY_POST_INVITEE', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [exact] }),
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [];
      },
      searchPreviewCandidates: async () => [weakLocal],
      previewOverlayEnabled: () => true,
    });

    expect(semanticCalls).toBe(0);
    expect(execution.response).toMatchObject({
      mode: 'keyword',
      results: [{ objectID: 'exact-reference' }, { objectID: 'local-doc' }],
    });
  });

  test('uses matching full-corpus local candidates for explicit non-editorial filters', async () => {
    const toolkit = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'calendar-toolkit', title: 'Calendar toolkit', sourceType: 'toolkit', pageRank: 1_500,
    }));
    const reference = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'sessions-reference', title: 'Sessions reference', sourceType: 'reference', pageRank: 700,
    }));
    const oauth = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'oauth-guide', title: 'OAuth guide', sourceType: 'oauth-guide', pageRank: 1_700,
    }));
    const cases = [
      { filter: 'toolkit' as const, query: 'Calendar toolkit', want: 'calendar-toolkit' },
      { filter: 'reference' as const, query: 'Sessions reference', want: 'sessions-reference' },
      { filter: 'oauth' as const, query: 'OAuth guide', want: 'oauth-guide' },
    ];

    for (const item of cases) {
      let localFilter = '';
      const execution = await searchPublicKnowledge({
        query: item.query, filter: item.filter, headers: new Headers(),
      }, {
        hybridEnabled: () => true,
        searchKeywordCandidates: async () => { throw new Error('keyword-request-failed'); },
        searchSemanticCandidates: async () => [],
        searchLocalCandidates: async (_query, filter) => {
          localFilter = filter;
          return [toolkit, reference, oauth];
        },
        previewOverlayEnabled: () => false,
      });

      expect(localFilter).toBe(item.filter);
      expect(execution.status).toBe(200);
      expect(execution.response).toMatchObject({ results: [{ objectID: item.want }] });
    }
  });

  test('does not bypass semantics for an exact identity beyond the returned keyword window', async () => {
    const weak = Array.from({ length: 20 }, (_, index) =>
      publicKnowledgeCandidateFromSearchRecord(record({
        id: `weak-${index}`,
        title: `Weak result ${index}`,
        sourceType: 'docs',
        pageRank: 2_000 - index,
      })));
    const outOfWindowExact = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'out-of-window-exact',
      title: 'Action reference',
      sourceType: 'reference',
      pageRank: 700,
      keywords: ['CALENDLY_POST_INVITEE'],
    }));
    let semanticCalls = 0;

    const execution = await searchPublicKnowledge({
      query: 'CALENDLY_POST_INVITEE', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [...weak, outOfWindowExact] }),
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [];
      },
      searchLocalCandidates: async () => [],
      previewOverlayEnabled: () => false,
    });

    expect(semanticCalls).toBe(1);
    expect(execution.response).toMatchObject({ mode: 'hybrid', strongMatch: false, results: [] });
  });

  test('reports preview overlay failure while preserving shared keyword results', async () => {
    const shared = publicKnowledgeCandidateFromSearchRecord(record({
      id: 'shared-doc', title: 'Shared title', sourceType: 'docs', pageRank: 2_000,
    }));
    const events: Array<{ degradationCategory: string | null }> = [];

    const execution = await searchPublicKnowledge({
      query: 'Shared title', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [shared] }),
      searchSemanticCandidates: async () => [],
      searchPreviewCandidates: async () => { throw new Error('local-index-failed'); },
      previewOverlayEnabled: () => true,
      captureSearch: event => events.push(event),
    });

    expect(execution.status).toBe(200);
    expect(execution.response).toMatchObject({ mode: 'keyword', results: [{ title: 'Shared title' }] });
    expect(execution.previewOverlayApplied).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ degradationCategory: 'preview-overlay-failed' });
  });

  test('returns 503 only when shared, local, and semantic retrieval all fail', async () => {
    const execution = await searchPublicKnowledge({
      query: 'unavailable answer', filter: 'all', headers: new Headers(),
    }, {
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => { throw new Error('keyword-request-failed'); },
      searchSemanticCandidates: async () => { throw new Error('semantic-request-failed'); },
      searchLocalCandidates: async () => { throw new Error('local-index-failed'); },
      previewOverlayEnabled: () => false,
    });

    expect(execution.status).toBe(503);
    expect(execution.response).toEqual({ error: 'Knowledge search is temporarily unavailable' });
  });
});
