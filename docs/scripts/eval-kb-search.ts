#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateKbSearchRankings,
  type KbSearchEvalCase,
  type KbSearchEvalRanking,
} from '@/lib/knowledge/evaluation';
import { searchKnowledgeRecords, type KnowledgeSearchResponse } from '@/lib/knowledge/search';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';
import type { KbManifest } from '@/lib/kb/types';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const baseUrl = argument('--base-url')?.replace(/\/$/, '');
const expectedMode = argument('--expect-mode');
const fixturePath = argument('--fixture') ?? join(process.cwd(), 'evals', 'kb-search-v1.json');
const jsonOutput = process.argv.includes('--json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  sourceCommit: string;
  cases: KbSearchEvalCase[];
};
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'kb', 'manifest.json'), 'utf8'),
) as KbManifest;
if (fixture.sourceCommit !== manifest.source.commit) {
  throw new Error(
    `KB search eval fixture targets ${fixture.sourceCommit}, but the snapshot is ${manifest.source.commit}; review and repin the eval cases`,
  );
}
const cases = fixture.cases;
const rankings = new Map<string, KbSearchEvalRanking[]>();
const observedModes = new Set<string>();

if (baseUrl) {
  for (const evalCase of cases) {
    const url = new URL('/api/knowledge-search', baseUrl);
    url.searchParams.set('q', evalCase.query);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search endpoint returned HTTP ${response.status} for eval case: ${evalCase.id}`);
    }
    const body = await response.json() as KnowledgeSearchResponse;
    observedModes.add(body.mode ?? 'unspecified');
    if (expectedMode && body.mode !== expectedMode) {
      throw new Error(
        `Expected retrieval mode ${expectedMode}, got ${body.mode ?? 'unspecified'} for: ${evalCase.id}`,
      );
    }
    rankings.set(evalCase.id, body.results.map(result => ({
      canonicalUrl: result.canonicalUrl,
      sourceType: result.sourceType,
    })));
  }
} else {
  const records = await getAlgoliaSearchDocuments();
  for (const evalCase of cases) {
    const response = searchKnowledgeRecords(records, {
      query: evalCase.query,
      filter: 'all',
      limit: 20,
    });
    rankings.set(evalCase.id, response.results.map(result => ({
      canonicalUrl: result.canonicalUrl,
      sourceType: result.sourceType,
    })));
  }
  observedModes.add('local-keyword');
}

const report = evaluateKbSearchRankings(cases, rankings);
if (jsonOutput) {
  console.log(JSON.stringify({ modes: [...observedModes], ...report }, null, 2));
  process.exit(0);
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
console.log(`KB search eval (${[...observedModes].join(', ')})`);
console.log(`Answerable: ${report.answerable.count}`);
console.log(`Recall@5: ${percent(report.answerable.recallAt5)}`);
console.log(`MRR@10: ${report.answerable.mrrAt10.toFixed(3)}`);
console.log(`Exact Recall@5: ${percent(report.byKind.exact.recallAt5)}`);
console.log(`Paraphrase Recall@5: ${percent(report.byKind.paraphrase.recallAt5)}`);
console.log(`No-answer empty@5: ${percent(report.noAnswer.emptyAt5Rate)}`);

const misses = report.cases.filter(result => result.kind !== 'no-answer' && !result.hitAt5);
if (misses.length > 0) {
  console.log('\nAnswerable misses at 5:');
  for (const miss of misses) {
    console.log(`- ${miss.id}: top=${miss.rankedUrls[0] ?? '(empty)'}`);
  }
}

const noisy = report.cases.filter(result => result.kind === 'no-answer' && result.rankedUrls.length > 0);
if (noisy.length > 0) {
  console.log('\nNo-answer queries with results:');
  for (const result of noisy) {
    console.log(`- ${result.id}: top=${result.rankedUrls[0]}`);
  }
}
