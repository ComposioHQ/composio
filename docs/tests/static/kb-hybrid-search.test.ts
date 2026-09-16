import { describe, expect, test } from 'bun:test';
import {
  fusePublicKbCandidates,
  type PublicKbCandidateRecord,
} from '@/lib/knowledge/hybrid-search';

function candidate(
  objectID: string,
  title: string,
  overrides: Partial<PublicKbCandidateRecord> = {},
): PublicKbCandidateRecord {
  return {
    objectID,
    pageID: `/kb/guide/${objectID}`,
    title,
    section: `${title} section`,
    description: `${title} description`,
    content: `${title} body`,
    canonicalUrl: `/kb/guide/${objectID}#answer`,
    breadcrumbs: ['Knowledge Base'],
    productAreas: [],
    toolkitSlugs: [],
    keywords: [],
    slug: objectID,
    toolNames: [],
    toolSlugs: [],
    pageRank: 1_900,
    sectionRank: 96,
    lastVerifiedAt: '2026-08-12',
    ...overrides,
  };
}

describe('public KB hybrid ranking', () => {
  test('pins exact titles and identifiers ahead of non-exact RRF winners', () => {
    const generic = candidate('generic', 'Troubleshoot calendar actions');
    const exactIdentifier = candidate('exact', 'Create a Calendly invitee', {
      toolSlugs: ['CALENDLY_POST_INVITEE'],
    });
    const semanticWinner = candidate('semantic', 'Invite people to events');

    const result = fusePublicKbCandidates({
      query: 'CALENDLY_POST_INVITEE',
      keyword: [generic, exactIdentifier],
      semantic: [semanticWinner, generic, exactIdentifier],
      limit: 20,
    });

    expect(result.map(item => item.record.objectID)).toEqual(['exact', 'generic', 'semantic']);
    expect(result[0]?.exactTier).toBe(2);
  });

  test('lets a paraphrase retrieved by both lists beat one-list keyword matches', () => {
    const paraphrase = candidate('paraphrase', 'Reconnect an expired OAuth account');
    const keywordOnly = candidate('keyword', 'Connection status reference');
    const semanticOnly = candidate('semantic', 'Refresh provider access');

    const result = fusePublicKbCandidates({
      query: 'my integration stopped working after access was revoked',
      keyword: [keywordOnly, paraphrase],
      semantic: [paraphrase, semanticOnly],
      limit: 20,
    });

    expect(result[0]?.record.objectID).toBe('paraphrase');
    expect(result[0]?.rrfScore).toBeCloseTo(1 / 62 + 1 / 61);
  });

  test('keeps only the strongest section for each canonical page', () => {
    const weakerSection = candidate('github-overview', 'GitHub overview', {
      canonicalUrl: '/kb/guide/github#overview',
      pageID: '/kb/guide/github',
      sectionRank: 80,
    });
    const strongerSection = candidate('github-tokens', 'GitHub tokens', {
      canonicalUrl: '/kb/guide/github#tokens',
      pageID: '/kb/guide/github',
      sectionRank: 100,
    });

    const result = fusePublicKbCandidates({
      query: 'github',
      keyword: [strongerSection, weakerSection],
      semantic: [weakerSection, strongerSection],
      limit: 20,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.record.objectID).toBe('github-tokens');
  });

  test('is deterministic with either retriever absent and caps displayed pages at twenty', () => {
    const records = Array.from({ length: 30 }, (_, index) => candidate(
      `record-${String(index).padStart(2, '0')}`,
      `Answer ${index}`,
      { pageRank: 1_900 - index },
    ));
    const expected = fusePublicKbCandidates({
      query: 'unmatched phrase',
      keyword: [],
      semantic: records,
      limit: 50,
    }).map(item => item.record.objectID);

    expect(expected).toHaveLength(20);
    for (let run = 0; run < 20; run += 1) {
      expect(fusePublicKbCandidates({
        query: 'unmatched phrase',
        keyword: [],
        semantic: records,
        limit: 50,
      }).map(item => item.record.objectID)).toEqual(expected);
    }
  });
});
