import type { KnowledgeSourceType } from './types';

export type KbSearchEvalKind = 'exact' | 'paraphrase' | 'no-answer';

export interface KbSearchEvalRanking {
  canonicalUrl: string;
  sourceType: KnowledgeSourceType;
}

export interface KbSearchEvalCase {
  id: string;
  kind: KbSearchEvalKind;
  query: string;
  expectedUrls: string[];
  expectedSourceTypes?: KnowledgeSourceType[];
  note?: string;
}

export interface KbSearchEvalCaseResult extends KbSearchEvalCase {
  rankedUrls: string[];
  rankedSourceTypes: Array<KnowledgeSourceType | null>;
  firstRelevantRank: number | null;
  hitAt5: boolean;
}

interface AnswerableMetrics {
  count: number;
  recallAt5: number;
  mrrAt10: number;
}

export interface KbSearchEvalReport {
  answerable: AnswerableMetrics;
  byKind: Record<'exact' | 'paraphrase', AnswerableMetrics>;
  noAnswer: {
    count: number;
    emptyAt5Rate: number;
  };
  cases: KbSearchEvalCaseResult[];
}

function canonicalPage(url: string): string {
  return url.split('#', 1)[0] ?? url;
}

function answerableMetrics(results: KbSearchEvalCaseResult[]): AnswerableMetrics {
  if (results.length === 0) return { count: 0, recallAt5: 0, mrrAt10: 0 };
  const hitsAt5 = results.filter(result => result.hitAt5).length;
  const reciprocalRanks = results.reduce((total, result) => {
    const rank = result.firstRelevantRank;
    return total + (rank !== null && rank <= 10 ? 1 / rank : 0);
  }, 0);
  return {
    count: results.length,
    recallAt5: hitsAt5 / results.length,
    mrrAt10: reciprocalRanks / results.length,
  };
}

export function evaluateKbSearchRankings(
  cases: KbSearchEvalCase[],
  rankings: ReadonlyMap<string, Array<string | KbSearchEvalRanking>>,
): KbSearchEvalReport {
  const seen = new Set<string>();
  const results = cases.map(evalCase => {
    if (!evalCase.id || seen.has(evalCase.id)) {
      throw new Error(`Eval case IDs must be unique and non-empty: ${evalCase.id}`);
    }
    seen.add(evalCase.id);
    if (!evalCase.query.trim()) throw new Error(`Eval case query is empty: ${evalCase.id}`);
    if (evalCase.kind === 'no-answer' && evalCase.expectedUrls.length > 0) {
      throw new Error(`No-answer eval case has expected URLs: ${evalCase.id}`);
    }
    if (evalCase.kind === 'no-answer' && (evalCase.expectedSourceTypes?.length ?? 0) > 0) {
      throw new Error(`No-answer eval case has expected source types: ${evalCase.id}`);
    }
    if (evalCase.kind !== 'no-answer' && evalCase.expectedUrls.length === 0 &&
      (evalCase.expectedSourceTypes?.length ?? 0) === 0) {
      throw new Error(`Answerable eval case has no expected URLs or source types: ${evalCase.id}`);
    }
    if (evalCase.expectedSourceTypes && evalCase.expectedSourceTypes.length === 0) {
      throw new Error(`Eval case has an empty expected source-type list: ${evalCase.id}`);
    }
    const ranked = rankings.get(evalCase.id);
    if (!ranked) throw new Error(`Missing ranking for eval case: ${evalCase.id}`);
    const rankedResults = ranked.map(result => typeof result === 'string'
      ? { canonicalUrl: result, sourceType: null }
      : result);
    const rankedUrls = rankedResults.map(result => result.canonicalUrl);
    const rankedSourceTypes = rankedResults.map(result => result.sourceType);
    const expectedPages = evalCase.kind !== 'no-answer' && evalCase.expectedUrls.length === 0
      ? null
      : new Set(evalCase.expectedUrls.map(canonicalPage));
    const expectedSourceTypes = evalCase.expectedSourceTypes
      ? new Set(evalCase.expectedSourceTypes)
      : null;
    const firstRelevantIndex = rankedResults.findIndex(result =>
      (expectedPages === null || expectedPages.has(canonicalPage(result.canonicalUrl))) &&
      (expectedSourceTypes === null || (
        result.sourceType !== null && expectedSourceTypes.has(result.sourceType)
      )));
    const firstRelevantRank = firstRelevantIndex === -1 ? null : firstRelevantIndex + 1;
    return {
      ...evalCase,
      rankedUrls,
      rankedSourceTypes,
      firstRelevantRank,
      hitAt5: firstRelevantRank !== null && firstRelevantRank <= 5,
    };
  });

  const exact = results.filter(result => result.kind === 'exact');
  const paraphrase = results.filter(result => result.kind === 'paraphrase');
  const noAnswer = results.filter(result => result.kind === 'no-answer');
  return {
    answerable: answerableMetrics([...exact, ...paraphrase]),
    byKind: {
      exact: answerableMetrics(exact),
      paraphrase: answerableMetrics(paraphrase),
    },
    noAnswer: {
      count: noAnswer.length,
      emptyAt5Rate: noAnswer.length === 0
        ? 0
        : noAnswer.filter(result => result.rankedUrls.slice(0, 5).length === 0).length / noAnswer.length,
    },
    cases: results,
  };
}
