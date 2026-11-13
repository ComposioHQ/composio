import { describe, expect, test } from 'bun:test';
import { createKnowledgeSearchHandler } from '@/app/api/knowledge-search/route';
import { getPostHogPageViewUrl } from '@/components/posthog-provider';
import {
  buildKnowledgeSearchCapture,
  redactKnowledgeSearchQuery,
  sendKnowledgeSearchAnalytics,
} from '@/lib/knowledge/query-analytics';
import type { PublicKnowledgeCandidateRecord } from '@/lib/knowledge/candidates';

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
  resultSourceTypes: string[];
  previewOverlayApplied: boolean;
}

function weakKeywordCandidate(): PublicKnowledgeCandidateRecord {
  return {
    objectID: 'weak-keyword',
    sourceType: 'docs',
    sourceLabel: 'Docs',
    pageID: '/docs/weak-keyword',
    title: 'GitHub OAuth guide',
    section: null,
    description: 'General GitHub OAuth guidance.',
    content: 'Reconnect GitHub access when authorization expires.',
    canonicalUrl: '/docs/weak-keyword',
    breadcrumbs: ['Docs'],
    productAreas: [],
    toolkitSlugs: ['github'],
    keywords: [],
    slug: 'github-oauth-guide',
    toolNames: [],
    toolSlugs: [],
    pageRank: 2_000,
    sectionRank: 100,
    lastVerifiedAt: null,
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
      searchKeywordCandidates: async () => ({ candidates: [weakKeywordCandidate()] }),
      captureSearch: event => events.push(event),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=why+did+github+oauth+fail&filter=docs',
    ));

    expect(response.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      query: 'why did github oauth fail',
      filter: 'docs',
      retrievalMode: 'keyword',
      resultCount: 1,
      degradationCategory: null,
      strongMatch: null,
      statusCode: 200,
      resultSourceTypes: ['docs'],
      previewOverlayApplied: false,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(events[0]?.keywordDurationMs).toBeGreaterThanOrEqual(0);
  });

  test('records a failed preview overlay without failing the search request', async () => {
    const events: CapturedSearchEvent[] = [];
    const handler = createKnowledgeSearchHandler({
      searchKeywordCandidates: async () => ({ candidates: [weakKeywordCandidate()] }),
      searchPreviewCandidates: async () => { throw new Error('preview-overlay-failed'); },
      previewOverlayEnabled: () => true,
      captureSearch: event => events.push(event),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=why+did+authorization+fail+again',
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: 'keyword' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ degradationCategory: 'preview-overlay-failed' });
  });

  test('builds an anonymous PostHog event with a lightly redacted query', () => {
    const capture = buildKnowledgeSearchCapture({
      query: 'GITHUB_CREATE_ISSUE failed token=sk-secretvalue123456',
      filter: 'docs',
      retrievalMode: 'keyword',
      resultCount: 2,
      degradationCategory: 'keyword-request-failed',
      strongMatch: null,
      statusCode: 200,
      durationMs: 42.7,
      keywordDurationMs: 8.2,
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
          filter: 'docs',
          retrieval_mode: 'keyword',
          result_count: 2,
          degradation_category: 'keyword-request-failed',
          strong_match: null,
          status_code: 200,
          duration_ms: 43,
          keyword_duration_ms: 8,
          result_source_types: ['reference', 'toolkit'],
          preview_overlay_applied: true,
        },
      },
    });
  });

  test('keeps query parameters on PostHog pageview URLs', () => {
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
        filter: 'docs',
        retrievalMode: 'keyword',
        resultCount: 3,
        degradationCategory: null,
        strongMatch: true,
        statusCode: 200,
        durationMs: 25,
        keywordDurationMs: 5,
        resultSourceTypes: ['docs'],
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
