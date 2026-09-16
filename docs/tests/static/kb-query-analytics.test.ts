import { describe, expect, test } from 'bun:test';
import { createKnowledgeSearchHandler } from '@/app/api/knowledge-search/route';
import { getPostHogPageViewUrl } from '@/components/posthog-provider';
import {
  buildKnowledgeSearchCapture,
  redactKnowledgeSearchQuery,
  sendKnowledgeSearchAnalytics,
} from '@/lib/knowledge/query-analytics';
import type { PublicKnowledgeCandidateRecord } from '@/lib/knowledge/hybrid-search';

interface CapturedSearchEvent {
  query: string;
  filter: string;
  retrievalMode: string;
  resultCount: number;
  degradationCategory: string | null;
  strongMatch: boolean | null;
  statusCode: number;
  durationMs: number;
  keywordDurationMs: number;
  semanticDurationMs: number | null;
  resultSourceTypes: string[];
  previewOverlayApplied: boolean;
}

function weakKeywordCandidate(): PublicKnowledgeCandidateRecord {
  return {
    objectID: 'weak-keyword',
    sourceType: 'kb',
    sourceLabel: 'Knowledge Base',
    pageID: '/kb/weak-keyword',
    title: 'GitHub OAuth guide',
    section: null,
    description: 'General GitHub OAuth guidance.',
    content: 'Reconnect GitHub access when authorization expires.',
    canonicalUrl: '/kb/weak-keyword',
    breadcrumbs: ['Knowledge Base'],
    productAreas: [],
    toolkitSlugs: ['github'],
    keywords: [],
    slug: 'github-oauth-guide',
    toolNames: [],
    toolSlugs: [],
    pageRank: 1_900,
    sectionRank: 100,
    lastVerifiedAt: '2026-08-18',
  };
}

describe('knowledge search analytics', () => {
  test.each([
    ['x-api-key header', 'x-api-key: api-value-123', 'x-api-key: [REDACTED]'],
    ['X-API-KEY environment field', 'X-API-KEY=api-value-123', 'X-API-KEY=[REDACTED]'],
    ['X_API_KEY environment field', 'X_API_KEY=api-value-123', 'X_API_KEY=[REDACTED]'],
  ])('redacts a %s', (_case, query, expected) => {
    expect(redactKnowledgeSearchQuery(query)).toBe(expected);
  });

  test.each([
    ['ordinary error code', 'Error code: NONEXISTENT_VERSION'],
    ['ordinary HTTP state', 'HTTP state=failed'],
  ])('preserves an %s', (_case, query) => {
    expect(redactKnowledgeSearchQuery(query)).toBe(query);
  });

  test('redacts credential fields in raw and URL-shaped queries without deleting prose', () => {
    expect(redactKnowledgeSearchQuery(
      "refresh_token=refresh-value-123 access-token: access-value-123 client_secret='client-value-123'",
    )).toBe(
      'refresh_token=[REDACTED] access-token: [REDACTED] client_secret=[REDACTED]',
    );
    expect(redactKnowledgeSearchQuery(
      'https://example.com/callback?refresh-token=refresh-value-123&access_token=access-value-123&client-secret=client-value-123&page=1',
    )).toBe(
      'https://example.com/callback?refresh-token=[REDACTED]&access_token=[REDACTED]&client-secret=[REDACTED]&page=1',
    );
    expect(redactKnowledgeSearchQuery(
      'https://example.com/callback?authorization=Bearer-value-123&code=oauth-code-123&state=opaque-state-123&page=1',
    )).toBe(
      'https://example.com/callback?authorization=[REDACTED]&code=[REDACTED]&state=[REDACTED]&page=1',
    );
    expect(redactKnowledgeSearchQuery(
      '{"code":"oauth-code-123","state":"opaque-state-123","status":"pending"}',
    )).toBe(
      '{"code":[REDACTED],"state":[REDACTED],"status":"pending"}',
    );
    expect(redactKnowledgeSearchQuery(
      'authorization: Bearer short-secret',
    )).toBe(
      'authorization: [REDACTED]',
    );
    expect(redactKnowledgeSearchQuery(
      'Authorization code flow keeps state between browser redirects, and refresh token rotation is automatic.',
    )).toBe(
      'Authorization code flow keeps state between browser redirects, and refresh token rotation is automatic.',
    );
  });

  test('records each completed API search with its retrieval outcome', async () => {
    const events: CapturedSearchEvent[] = [];
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [] }),
      searchSemanticCandidates: async () => [],
      captureSearch: event => events.push(event),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=why+did+github+oauth+fail&filter=kb',
    ));

    expect(response.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      query: 'why did github oauth fail',
      filter: 'kb',
      retrievalMode: 'hybrid',
      resultCount: 0,
      degradationCategory: null,
      strongMatch: false,
      statusCode: 200,
      resultSourceTypes: [],
      previewOverlayApplied: false,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(events[0]?.keywordDurationMs).toBeGreaterThanOrEqual(0);
    expect(events[0]?.semanticDurationMs).toBeGreaterThanOrEqual(0);
  });

  test('records semantic guardrail hits without failing the search request', async () => {
    const events: CapturedSearchEvent[] = [];
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [] }),
      searchSemanticCandidates: async () => {
        throw new Error('semantic search should not run after admission is denied');
      },
      acquireSemanticSearch: () => ({
        allowed: false,
        reason: 'semantic-capacity-limited',
      }),
      captureSearch: event => events.push(event),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=github+oauth&filter=kb',
    ));

    expect(response.status).toBe(200);
    const responseBody = await response.json() as Record<string, unknown>;
    expect(responseBody).toMatchObject({ mode: 'keyword' });
    expect(responseBody).not.toHaveProperty('degradedReason');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      retrievalMode: 'keyword',
      degradationCategory: 'semantic-capacity-limited',
      statusCode: 200,
    });
  });

  for (const guardrail of [
    'semantic-timeout',
    'semantic-rate-limited',
    'semantic-capacity-limited',
  ] as const) {
    test(`keeps ${guardrail} visible when the preview overlay also fails`, async () => {
      const events: CapturedSearchEvent[] = [];
      const handler = createKnowledgeSearchHandler({
        hybridEnabled: () => true,
        searchKeywordCandidates: async () => ({ candidates: [weakKeywordCandidate()] }),
        searchSemanticCandidates: async () => guardrail === 'semantic-timeout'
          ? new Promise<never>(() => {})
          : Promise.reject(new Error('semantic search should not run after admission is denied')),
        searchLocalCandidates: async () => { throw new Error('preview-overlay-failed'); },
        searchPreviewCandidates: async () => { throw new Error('preview-overlay-failed'); },
        previewOverlayEnabled: () => true,
        ...(guardrail === 'semantic-timeout'
          ? { semanticTimeoutMs: () => 1 }
          : {
              acquireSemanticSearch: () => ({
                allowed: false as const,
                reason: guardrail,
              }),
            }),
        captureSearch: event => events.push(event),
      });

      const response = await handler(new Request(
        'http://localhost/api/knowledge-search?q=why+did+authorization+fail+again&filter=kb',
      ));

      expect(response.status).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ degradationCategory: guardrail });
    });
  }

  test('builds an anonymous PostHog event with a lightly redacted query', () => {
    const capture = buildKnowledgeSearchCapture({
      query: 'GITHUB_CREATE_ISSUE failed token=sk-secretvalue123456',
      filter: 'kb',
      retrievalMode: 'keyword',
      resultCount: 2,
      degradationCategory: 'semantic-request-failed',
      strongMatch: null,
      statusCode: 200,
      durationMs: 42.7,
      keywordDurationMs: 8.2,
      semanticDurationMs: null,
      resultSourceTypes: ['reference', 'toolkit'],
      previewOverlayApplied: true,
    }, {
      apiKey: 'phc_project_token',
      host: 'https://us.i.posthog.com/',
    });

    expect(capture).toEqual({
      url: 'https://us.i.posthog.com/i/v0/e/',
      body: {
        api_key: 'phc_project_token',
        event: 'kb_search_executed',
        properties: {
          distinct_id: 'public-kb-search',
          '$process_person_profile': false,
          query: 'GITHUB_CREATE_ISSUE failed token=[REDACTED]',
          filter: 'kb',
          retrieval_mode: 'keyword',
          result_count: 2,
          degradation_category: 'semantic-request-failed',
          strong_match: null,
          status_code: 200,
          duration_ms: 43,
          keyword_duration_ms: 8,
          semantic_duration_ms: null,
          result_source_types: ['reference', 'toolkit'],
          preview_overlay_applied: true,
        },
      },
    });
  });

  test('removes the KB query from generic PostHog pageview URLs', () => {
    expect(getPostHogPageViewUrl(
      'https://docs.composio.dev',
      '/kb/search',
      new URLSearchParams('q=github+oauth&filter=kb'),
    )).toBe('https://docs.composio.dev/kb/search?filter=kb');
    expect(getPostHogPageViewUrl(
      'https://docs.composio.dev',
      '/docs',
      new URLSearchParams('framework=nextjs'),
    )).toBe('https://docs.composio.dev/docs?framework=nextjs');
  });

  test('delivers the capture payload to the configured PostHog ingestion host', async () => {
    let receivedPath = '';
    let receivedBody: unknown;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        receivedPath = new URL(request.url).pathname;
        receivedBody = await request.json();
        return new Response(null, { status: 202 });
      },
    });
    try {
      expect(await sendKnowledgeSearchAnalytics({
        query: 'github oauth delivery test',
        filter: 'kb',
        retrievalMode: 'hybrid',
        resultCount: 3,
        degradationCategory: null,
        strongMatch: true,
        statusCode: 200,
        durationMs: 25,
        keywordDurationMs: 5,
        semanticDurationMs: 12,
        resultSourceTypes: ['kb'],
        previewOverlayApplied: false,
      }, {
        apiKey: 'phc_project_token',
        host: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1_000,
      })).toBe(true);
      expect(receivedPath).toBe('/i/v0/e/');
      expect(receivedBody).toMatchObject({
        event: 'kb_search_executed',
        properties: { query: 'github oauth delivery test' },
      });
    } finally {
      server.stop(true);
    }
  });
});
