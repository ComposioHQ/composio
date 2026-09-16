import { describe, expect, test } from 'bun:test';
import {
  evaluateKbSearchRankings,
  type KbSearchEvalCase,
} from '@/lib/knowledge/evaluation';

const cases: KbSearchEvalCase[] = [
  {
    id: 'exact-hit',
    kind: 'exact',
    query: 'CALENDLY_POST_INVITEE',
    expectedUrls: ['/kb/guide/calendly'],
  },
  {
    id: 'paraphrase-hit',
    kind: 'paraphrase',
    query: 'my calendar alias fails',
    expectedUrls: ['/kb/guide/google-calendar'],
  },
  {
    id: 'paraphrase-miss',
    kind: 'paraphrase',
    query: 'connection stopped unexpectedly',
    expectedUrls: ['/kb/guide/connected-accounts'],
  },
  {
    id: 'out-of-scope',
    kind: 'no-answer',
    query: 'best pizza near the office',
    expectedUrls: [],
  },
];

describe('KB search evaluation metrics', () => {
  test('computes recall, reciprocal rank, and no-answer empty rate by query kind', () => {
    const report = evaluateKbSearchRankings(cases, new Map([
      ['exact-hit', ['/kb/guide/calendly#answer']],
      ['paraphrase-hit', ['/kb/guide/unrelated', '/kb/guide/google-calendar#answer']],
      ['paraphrase-miss', ['/kb/guide/unrelated']],
      ['out-of-scope', []],
    ]));

    expect(report.answerable.count).toBe(3);
    expect(report.answerable.recallAt5).toBeCloseTo(2 / 3);
    expect(report.answerable.mrrAt10).toBeCloseTo((1 + 0.5) / 3);
    expect(report.byKind.exact.recallAt5).toBe(1);
    expect(report.byKind.paraphrase.recallAt5).toBe(0.5);
    expect(report.noAnswer.emptyAt5Rate).toBe(1);
    expect(report.cases.find(result => result.id === 'paraphrase-hit')?.firstRelevantRank).toBe(2);
    expect(report.cases.find(result => result.id === 'out-of-scope')).toMatchObject({
      firstRelevantRank: null,
      hitAt5: false,
    });
  });

  test('matches expected pages regardless of result anchors and rejects missing rankings', () => {
    expect(() => evaluateKbSearchRankings(cases, new Map([
      ['exact-hit', ['/kb/guide/calendly']],
    ]))).toThrow('Missing ranking for eval case: paraphrase-hit');
  });

  test('requires an accepted source class for structural eval cases', () => {
    const structuralCase: KbSearchEvalCase = {
      id: 'connect-claude',
      kind: 'paraphrase',
      query: 'how to connect to claude',
      expectedUrls: ['/docs/composio-connect'],
      expectedSourceTypes: ['docs'],
    };

    const report = evaluateKbSearchRankings([structuralCase], new Map([
      ['connect-claude', [
        { canonicalUrl: '/docs/composio-connect', sourceType: 'kb' },
        { canonicalUrl: '/docs/composio-connect#claude-code', sourceType: 'docs' },
      ]],
    ]));

    expect(report.cases[0]?.firstRelevantRank).toBe(2);
    expect(report.cases[0]?.rankedSourceTypes).toEqual(['kb', 'docs']);
  });

  test('supports source-only structural cases without mutable answer expectations', () => {
    const report = evaluateKbSearchRankings([{
      id: 'calendly-source',
      kind: 'exact',
      query: 'CALENDLY_POST_INVITEE',
      expectedUrls: [],
      expectedSourceTypes: ['toolkit', 'reference'],
    }], new Map([
      ['calendly-source', [
        { canonicalUrl: '/kb/guide/toolkits-calendly', sourceType: 'kb' },
        { canonicalUrl: '/toolkits/calendly', sourceType: 'toolkit' },
      ]],
    ]));

    expect(report.cases[0]?.firstRelevantRank).toBe(2);
  });

  test('never marks a no-answer result as relevant', () => {
    const report = evaluateKbSearchRankings([{
      id: 'no-answer-with-noise',
      kind: 'no-answer',
      query: 'best pizza tonight',
      expectedUrls: [],
    }], new Map([
      ['no-answer-with-noise', [{ canonicalUrl: '/docs', sourceType: 'docs' }]],
    ]));

    expect(report.cases[0]).toMatchObject({ firstRelevantRank: null, hitAt5: false });
  });
});
