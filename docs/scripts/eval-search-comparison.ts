#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { evaluateKbSearchRankings } from '../lib/knowledge/evaluation';

const knowledgeSchema = z.object({
  mode: z.string(),
  results: z.array(z.object({
    title: z.string(), canonicalUrl: z.string(), excerpt: z.string(),
  })),
});
const cloudflareSchema = z.object({
  success: z.literal(true),
  result: z.object({ chunks: z.array(z.object({
    text: z.string(),
    item: z.object({ key: z.string(), metadata: z.object({ title: z.string().optional() }).optional() }),
  })) }),
});
const casesSchema = z.array(z.object({
  id: z.string().min(1), kind: z.enum(['exact', 'paraphrase']),
  query: z.string().min(1), expectedUrls: z.array(z.string().startsWith('/')).min(1),
})).min(1);

/** Compare pages, not duplicate chunks, anchors, or query-string variants. */
export function pagePath(value: string): string {
  const url = new URL(value, 'https://docs.composio.dev');
  if (url.origin !== 'https://docs.composio.dev') throw new Error(`Non-docs result: ${url.origin}`);
  return url.pathname.replace(/\/$/, '') || '/';
}

export function parseResults(provider: 'current' | 'cloudflare', input: unknown) {
  const hits = provider === 'current'
    ? knowledgeSchema.parse(input).results.map(hit => ({
      title: hit.title, url: hit.canonicalUrl, excerpt: hit.excerpt,
    }))
    : cloudflareSchema.parse(input).result.chunks.map(chunk => ({
      title: chunk.item.metadata?.title ?? chunk.item.key,
      url: chunk.item.key, excerpt: chunk.text,
    }));
  const seen = new Set<string>();
  return hits.flatMap(hit => {
    const url = pagePath(hit.url);
    if (seen.has(url)) return [];
    seen.add(url);
    return [{ ...hit, url }];
  }).slice(0, 10);
}

async function main() {
  const { values } = parseArgs({ options: {
    cloudflare: { type: 'string' },
    'base-url': { type: 'string', default: 'https://docs.composio.dev' },
    output: { type: 'string', default: '../.artifacts/docs-search-eval' },
  } });
  const cloudflare = values.cloudflare ?? process.env.DOCS_AI_SEARCH_URL;
  const cases = casesSchema.parse(JSON.parse(await readFile(new URL('../evals/search-comparison/cases.json', import.meta.url), 'utf8')));
  const providers = cloudflare ? ['current', 'cloudflare'] as const : ['current'] as const;
  const runs = [];
  let errors = 0;
  for (const provider of providers) {
    const rows = [];
    for (const row of cases) {
      const url = provider === 'current'
        ? new URL(`/api/knowledge-search?q=${encodeURIComponent(row.query)}`, values['base-url'])
        : new URL(cloudflare!);
      const started = performance.now();
      let raw: unknown = null;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(45_000),
          ...(provider === 'cloudflare' ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: new URL(values['base-url']!).origin },
            body: JSON.stringify({
              messages: [{ role: 'user', content: row.query }],
              ai_search_options: { retrieval: { max_num_results: 20 } },
            }),
          } : {}),
        });
        const body = await response.text();
        raw = body;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        raw = JSON.parse(body);
        const hits = parseResults(provider, raw);
        rows.push({ id: row.id, ms: Math.round(performance.now() - started), hits, raw, error: null });
      } catch (error) {
        errors++;
        rows.push({ id: row.id, ms: Math.round(performance.now() - started), hits: [], raw, error: String(error) });
      }
      console.error(`${provider}: ${row.id} (${rows.at(-1)!.error ?? 'ok'})`);
    }
    const evaluation = evaluateKbSearchRankings(cases, new Map(rows.map(row => [row.id, row.hits.map(hit => hit.url)])));
    runs.push({ provider, rows, evaluation });
  }
  const report = {
    timestamp: new Date().toISOString(), baseline: values['base-url'], cloudflare: cloudflare ?? null,
    cases, runs,
  };
  const lines = [
    '# Docs search comparison', '',
    `Run: ${report.timestamp}`, '',
    'Current = live KB search API, not the exact ⌘K dialog ranking or generated Ask AI answers.',
    'Cloudflare uses the instance settings and requests up to 20 chunks; repeated pages count once.',
    'URL hits are a relevance proxy. Review the excerpts and the manual answer checks before deciding.', '',
    '| Provider | Expected page in top 5 | Exact-name hits | Median request ms | Errors |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const run of runs) {
    const times = run.rows.filter(row => !row.error).map(row => row.ms).sort((a, b) => a - b);
    const midpoint = Math.floor(times.length / 2);
    const median = times.length
      ? Math.round((times[midpoint] + times[Math.floor((times.length - 1) / 2)]) / 2)
      : 'n/a';
    const hitCount = run.evaluation.cases.filter(row => row.hitAt5).length;
    const exact = run.evaluation.cases.filter(row => row.kind === 'exact');
    lines.push(`| ${run.provider} | ${hitCount}/${cases.length} | ${exact.filter(row => row.hitAt5).length}/${exact.length} | ${median} | ${run.rows.filter(row => row.error).length} |`);
  }
  if (!cloudflare) lines.push('', '**Cloudflare NOT RUN: pass --cloudflare or DOCS_AI_SEARCH_URL. This is a baseline only.**');
  lines.push('', 'Errors stay in the denominator; they are not successful empty searches. Latency is one sequential sample per query, not a benchmark.', '');
  for (const row of cases) {
    lines.push(`## ${row.id}`, '', row.query, '', `Acceptable pages: ${row.expectedUrls.join(', ')}`, '');
    for (const run of runs) {
      const result = run.rows.find(result => result.id === row.id)!;
      const grade = run.evaluation.cases.find(result => result.id === row.id)!;
      lines.push(`### ${run.provider}: ${result.error ? 'ERROR' : grade.hitAt5 ? 'HIT' : 'REVIEW MISS'} (${result.ms} ms)`, '');
      if (result.error) lines.push(result.error, '');
      for (const hit of result.hits.slice(0, 5)) {
        lines.push(`- [${hit.title.replace(/[\[\]\n]/g, ' ')}](https://docs.composio.dev${hit.url}) — ${hit.excerpt.replace(/\s+/g, ' ').slice(0, 240)}`);
      }
      lines.push('');
    }
  }
  await mkdir(values.output!, { recursive: true });
  await writeFile(join(values.output!, 'results.json'), JSON.stringify(report, null, 2));
  await writeFile(join(values.output!, 'report.md'), lines.join('\n'));
  console.log(lines.slice(0, lines.indexOf('## ' + cases[0].id)).join('\n'));
  console.log(`Details: ${join(values.output!, 'report.md')}`);
  console.log(`Raw responses: ${join(values.output!, 'results.json')}`);
  if (errors) process.exitCode = 1;
}

if (import.meta.main) await main();
