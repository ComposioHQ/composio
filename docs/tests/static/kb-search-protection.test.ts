import { describe, expect, test } from 'bun:test';
import { createKnowledgeSearchHandler } from '@/app/api/knowledge-search/route';
import type { PublicKbCandidateRecord } from '@/lib/knowledge/hybrid-search';
import {
  SemanticSearchBudget,
  semanticSearchClientKey,
} from '@/lib/knowledge/semantic-protection';

function keywordCandidate(): PublicKbCandidateRecord {
  return {
    objectID: 'github-oauth',
    pageID: '/kb/guide/github-oauth',
    title: 'GitHub OAuth troubleshooting',
    section: 'Reconnect expired access',
    description: 'Reconnect GitHub after OAuth access expires.',
    content: 'Reconnect the GitHub account and retry the action.',
    canonicalUrl: '/kb/guide/github-oauth#reconnect-expired-access',
    breadcrumbs: ['Knowledge Base', 'GitHub'],
    productAreas: [],
    toolkitSlugs: ['github'],
    keywords: ['github oauth'],
    slug: 'github-oauth',
    toolNames: [],
    toolSlugs: [],
    pageRank: 1_900,
    sectionRank: 96,
    lastVerifiedAt: '2026-08-17',
  };
}

describe('knowledge search semantic protection', () => {
  test('returns keyword results when semantic search exceeds its latency budget', async () => {
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [keywordCandidate()] }),
      searchSemanticCandidates: async () => new Promise<never>(() => {}),
      semanticTimeoutMs: () => 10,
    });
    let guard: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'deadline'>(resolve => {
      guard = setTimeout(() => resolve('deadline'), 250);
    });

    const result = await Promise.race([
      handler(new Request(
        'http://localhost/api/knowledge-search?q=github+oauth&filter=kb',
      )),
      deadline,
    ]);
    if (guard) clearTimeout(guard);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(200);
    const responseBody = await result.json() as Record<string, unknown>;
    expect(responseBody).toMatchObject({
      mode: 'keyword',
      results: [{ objectID: 'github-oauth' }],
    });
    expect(responseBody).not.toHaveProperty('degradedReason');
  });

  test('returns keyword results without spending an embedding when the soft budget is exhausted', async () => {
    let semanticCalls = 0;
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [keywordCandidate()] }),
      searchSemanticCandidates: async () => {
        semanticCalls += 1;
        return [];
      },
      acquireSemanticSearch: () => ({
        allowed: false,
        reason: 'semantic-rate-limited',
      }),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=github+oauth&filter=kb',
    ));

    expect(response.status).toBe(200);
    expect(semanticCalls).toBe(0);
    const responseBody = await response.json() as Record<string, unknown>;
    expect(responseBody).toMatchObject({
      mode: 'keyword',
      results: [{ objectID: 'github-oauth' }],
    });
    expect(responseBody).not.toHaveProperty('degradedReason');
  });
});

describe('semantic search budget', () => {
  test('applies a global ceiling to anonymous and rotating clients', () => {
    const budget = new SemanticSearchBudget({
      requestsPerWindow: 10,
      globalRequestsPerWindow: 2,
      windowMs: 60_000,
      maxConcurrent: 2,
    });
    const anonymous = budget.tryAcquire();
    anonymous.release?.();
    const firstClient = budget.tryAcquire('client-a');
    firstClient.release?.();

    expect(budget.tryAcquire('client-b')).toEqual({
      allowed: false,
      reason: 'semantic-rate-limited',
    });
  });

  test('derives a stable opaque client key from the trusted forwarding header', () => {
    const first = semanticSearchClientKey(new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    }));
    const second = semanticSearchClientKey(new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    }));

    expect(first).toBe(second);
    expect(first).not.toContain('203.0.113.7');
    expect(semanticSearchClientKey(new Request('http://localhost'))).toBeUndefined();
  });

  test('replenishes a client budget after the configured window', () => {
    let now = 0;
    const budget = new SemanticSearchBudget({
      requestsPerWindow: 2,
      windowMs: 1_000,
      maxConcurrent: 2,
      now: () => now,
    });
    const first = budget.tryAcquire('client-a');
    first.release?.();
    const second = budget.tryAcquire('client-a');
    second.release?.();

    expect(budget.tryAcquire('client-a')).toEqual({
      allowed: false,
      reason: 'semantic-rate-limited',
    });
    now = 1_001;
    expect(budget.tryAcquire('client-a').allowed).toBe(true);
  });

  test('releases concurrency immediately without replenishing the request budget', () => {
    const budget = new SemanticSearchBudget({
      requestsPerWindow: 10,
      windowMs: 60_000,
      maxConcurrent: 1,
    });
    const first = budget.tryAcquire('client-a');
    expect(first.allowed).toBe(true);
    expect(budget.tryAcquire('client-b')).toEqual({
      allowed: false,
      reason: 'semantic-capacity-limited',
    });

    first.release?.();
    expect(budget.tryAcquire('client-b').allowed).toBe(true);
  });
});
