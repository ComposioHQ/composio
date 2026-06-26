import {
  buildBundledIndex,
  buildIndex,
  extractSections,
  getBundleSearchIndex,
  pageSearchKey,
  readPageByUrl,
  toCleanMarkdown,
  tokenize,
  type DocPage,
} from './docs';

/**
 * search_docs — find the most relevant Composio docs pages for a query.
 *
 * This is a local, in-memory lexical retriever. It uses a BM25-style body score
 * plus field boosts for title, description, headings, and URL. The top results
 * include full page content (bounded per page), so the model gets rich context
 * in the same fast tool call instead of doing a serial search -> read round trip.
 */

// Collection priority: docs first, then examples, then references and toolkits.
// (Curated knowledge ranks with docs.) A toolkit-name query still surfaces its
// toolkit page because nothing else matches it.
const PRIORITY: Record<DocPage['collection'], number> = {
  docs: 1.3,
  knowledge: 1.3,
  examples: 1.1,
  reference: 0.85,
  toolkits: 0.9,
};

export const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_LIMIT = DEFAULT_SEARCH_LIMIT;
export const DEFAULT_CONTENT_RESULT_COUNT = 4;
export const DEFAULT_MAX_CONTENT_CHARS = 10_000;
export const DEFAULT_MAX_SECTIONS = 16;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const PERF_LOG_ENABLED = process.env.DOCS_AGENT_SEARCH_PERF_LOG === '1';
const PERF_LOG_QUERY = process.env.DOCS_AGENT_SEARCH_LOG_QUERY === '1';

type CorpusEntry = {
  page: DocPage;
  termCounts: Map<string, number>;
  length: number;
};

type Corpus = {
  entries: CorpusEntry[];
  documentFrequency: Map<string, number>;
  averageLength: number;
};

type CorpusSource = 'precomputed' | 'runtime';

type PrecomputedCorpusResult =
  | { corpus: Corpus; fallbackReason?: never }
  | { corpus?: never; fallbackReason: string };

type CorpusLoad = {
  corpus: Corpus;
  source: CorpusSource;
  cached: boolean;
  loadMs: number;
  fallbackReason?: string;
};

let corpusCache: Corpus | undefined;
let corpusCacheSource: CorpusSource | undefined;
let corpusCacheFallbackReason: string | undefined;

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function logPerf(payload: Record<string, unknown>) {
  if (!PERF_LOG_ENABLED) return;
  console.info(`[docs-agent:search_docs] ${JSON.stringify(payload)}`);
}

function termCountsFor(page: DocPage): Map<string, number> {
  const counts = new Map<string, number>();

  for (const token of tokenize(page.lowerText)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function buildRuntimeCorpus(pages: DocPage[]): Corpus {
  const entries = pages.map(page => {
    const termCounts = termCountsFor(page);
    return {
      page,
      termCounts,
      length: [...termCounts.values()].reduce((sum, count) => sum + count, 0),
    };
  });
  const documentFrequency = new Map<string, number>();

  for (const entry of entries) {
    for (const term of entry.termCounts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return {
    entries,
    documentFrequency,
    averageLength:
      entries.reduce((sum, entry) => sum + entry.length, 0) / Math.max(entries.length, 1),
  };
}

function buildPrecomputedCorpus(pages: DocPage[]): PrecomputedCorpusResult {
  const search = getBundleSearchIndex();
  if (!search) return { fallbackReason: 'missing-precomputed-index' };
  if (search.entries.length !== pages.length) {
    return { fallbackReason: `entry-count-mismatch:${search.entries.length}:${pages.length}` };
  }

  const entries: CorpusEntry[] = [];

  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const entry = search.entries[index];

    if (!entry) return { fallbackReason: `missing-entry:${index}` };
    if (entry.key !== pageSearchKey(page)) {
      return { fallbackReason: `entry-key-mismatch:${index}:${page.url}` };
    }

    entries.push({
      page,
      termCounts: new Map(entry.terms),
      length: entry.length,
    });
  }

  return {
    corpus: {
      entries,
      documentFrequency: new Map(search.documentFrequency),
      averageLength: search.averageLength,
    },
  };
}

function getCorpus(): CorpusLoad {
  if (corpusCache && corpusCacheSource) {
    return {
      corpus: corpusCache,
      source: corpusCacheSource,
      cached: true,
      loadMs: 0,
      fallbackReason: corpusCacheFallbackReason,
    };
  }

  const started = performance.now();
  const bundledPages = buildBundledIndex();
  const bundledPrecomputed = buildPrecomputedCorpus(bundledPages);

  if (bundledPrecomputed.corpus) {
    corpusCache = bundledPrecomputed.corpus;
    corpusCacheSource = 'precomputed';
  } else {
    const pages = buildIndex();
    const livePrecomputed = buildPrecomputedCorpus(pages);

    if (livePrecomputed.corpus) {
      corpusCache = livePrecomputed.corpus;
      corpusCacheSource = 'precomputed';
    } else {
      corpusCache = buildRuntimeCorpus(pages);
      corpusCacheSource = 'runtime';
      corpusCacheFallbackReason = `bundle:${bundledPrecomputed.fallbackReason};live:${livePrecomputed.fallbackReason}`;
    }
  }

  return {
    corpus: corpusCache,
    source: corpusCacheSource,
    cached: false,
    loadMs: performance.now() - started,
    fallbackReason: corpusCacheFallbackReason,
  };
}

function idf(term: string, corpus: Corpus): number {
  const n = corpus.entries.length;
  const df = corpus.documentFrequency.get(term) ?? 0;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

function bm25(entry: CorpusEntry, terms: string[], corpus: Corpus): number {
  let total = 0;

  for (const term of terms) {
    const tf = entry.termCounts.get(term) ?? 0;
    if (tf === 0) continue;

    const denominator =
      tf + BM25_K1 * (1 - BM25_B + BM25_B * (entry.length / corpus.averageLength));
    total += idf(term, corpus) * ((tf * (BM25_K1 + 1)) / denominator);
  }

  return total;
}

function fieldBoost(page: DocPage, terms: string[]): number {
  const title = page.title.toLowerCase();
  const description = page.description.toLowerCase();
  const url = page.url.toLowerCase();
  let total = 0;

  for (const term of terms) {
    if (title.includes(term)) total += 12;
    if (description.includes(term)) total += 5;
    for (const heading of page.headings) if (heading.includes(term)) total += 4;
    if (url.includes(term)) total += 6;
  }

  return total;
}

function score(entry: CorpusEntry, terms: string[], corpus: Corpus): number {
  let total = bm25(entry, terms, corpus) * 8 + fieldBoost(entry.page, terms);
  const isMigrationIntent = terms.some(term =>
    ['migration', 'migrate', 'direct', 'legacy', 'v1', 'v2'].includes(term)
  );

  // Heavily downrank legacy (direct-execution) pages so they only surface when
  // nothing in the session-based docs matches.
  if (entry.page.legacy) total *= 0.12;
  // Migration pages mention both old and current APIs a lot; keep them for
  // migration/direct-execution questions, but don't let them beat canonical
  // session docs for ordinary usage questions.
  if (!isMigrationIntent && entry.page.url.includes('/migration-guide')) total *= 0.35;
  return total * (PRIORITY[entry.page.collection] ?? 1);
}

function firstTermMatch(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return (
    terms
      .map(term => lower.indexOf(term))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0] ?? 0
  );
}

function excerpt(
  text: string,
  terms: string[],
  maxChars: number
): { value: string; truncated: boolean } {
  const at = firstTermMatch(text, terms);
  const start = Math.max(0, at - 180);
  const end = Math.min(text.length, start + maxChars);
  const slice = text.slice(start, end).trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';

  return { value: `${prefix}${slice}${suffix}`, truncated: start > 0 || end < text.length };
}

function snippet(page: DocPage, terms: string[]): string {
  return excerpt(page.text, terms, 360).value;
}

function dedupeByUrl(ranked: { page: DocPage; s: number }[]): { page: DocPage; s: number }[] {
  const seen = new Set<string>();
  const deduped: { page: DocPage; s: number }[] = [];

  for (const item of ranked) {
    if (seen.has(item.page.url)) continue;
    seen.add(item.page.url);
    deduped.push(item);
  }

  return deduped;
}

function contentFor(
  page: DocPage,
  terms: string[],
  maxContentChars: number,
  maxSections: number
) {
  if (page.collection === 'knowledge') {
    const evidence = excerpt(page.text, terms, maxContentChars);
    return {
      content: evidence.value,
      contentTruncated: evidence.truncated,
    };
  }

  const found = readPageByUrl(page.url);

  if (found) {
    const markdown = toCleanMarkdown(found.raw);
    const evidence = excerpt(markdown, terms, maxContentChars);

    return {
      sections: extractSections(markdown).slice(0, maxSections),
      content: evidence.value,
      contentTruncated: evidence.truncated,
    };
  }

  const evidence = excerpt(page.text, terms, maxContentChars);
  return {
    content: evidence.value,
    contentTruncated: evidence.truncated,
  };
}


export type SearchDocsInvocation = 'tool' | 'eager_context' | 'eager_preview' | (string & {});

export type SearchDocsOptions = {
  limit?: number;
  invocation?: SearchDocsInvocation;
  contentResultCount?: number;
  maxContentChars?: number;
  maxSections?: number;
  /** When false, skip page hydration and return metadata/snippets only. */
  hydrateContent?: boolean;
};

export const EAGER_SEARCH_ENABLED = process.env.DOCS_AGENT_EAGER_SEARCH !== '0';

export function shouldRunEagerDocsSearch(text: string): boolean {
  if (!EAGER_SEARCH_ENABLED) return false;
  if (text.trim().length < 3) return false;

  const normalized = text.toLowerCase();
  const accountTerms =
    /\b(account|billing|invoice|payment|refund|subscription|ticket|dashboard|workspace|organization|org|api key)\b/;
  const personalTerms =
    /\b(my|our|me|us|latest|current|status|paid|check|look up|lookup|change|cancel|delete|update)\b/;

  return !(accountTerms.test(normalized) && personalTerms.test(normalized));
}

export type SearchDocsResult = {
  retrieval: 'bm25-lexical-local';
  results: Array<{
    title: string;
    url: string;
    description: string;
    snippet: string;
    sections?: { title: string; anchor: string }[];
    content?: string;
    contentTruncated?: boolean;
  }>;
};

export function searchDocs(query: string, options: SearchDocsOptions = {}): SearchDocsResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const contentResultCount = options.contentResultCount ?? DEFAULT_CONTENT_RESULT_COUNT;
  const maxContentChars = options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS;
  const maxSections = options.maxSections ?? DEFAULT_MAX_SECTIONS;
  const hydrateContent = options.hydrateContent ?? true;
  const totalStarted = performance.now();
  const tokenizeStarted = performance.now();
  const terms = tokenize(query);
  // Fall back to raw terms if the query was all stopwords.
  const effective =
    terms.length > 0
      ? terms
      : query
          .toLowerCase()
          .split(/\s+/)
          .filter(t => t.length > 1);
  const tokenizeMs = performance.now() - tokenizeStarted;

  const corpusLoad = getCorpus();
  const corpus = corpusLoad.corpus;

  const rankStarted = performance.now();
  const ranked = dedupeByUrl(
    corpus.entries
      .map(entry => ({ page: entry.page, s: score(entry, effective, corpus) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
  ).slice(0, limit);
  const rankMs = performance.now() - rankStarted;

  const hydrateStarted = performance.now();
  const results = ranked.map(({ page }, index) => ({
    title: page.title,
    url: page.url,
    description: page.description,
    snippet: snippet(page, effective),
    ...(hydrateContent && index < contentResultCount
      ? contentFor(page, effective, maxContentChars, maxSections)
      : {}),
  }));
  const hydrateMs = performance.now() - hydrateStarted;
  const totalMs = performance.now() - totalStarted;

  logPerf({
    event: 'search_docs',
    invocation: options.invocation ?? 'tool',
    retrieval: 'bm25-lexical-local',
    totalMs: roundMs(totalMs),
    tokenizeMs: roundMs(tokenizeMs),
    corpusLoadMs: roundMs(corpusLoad.loadMs),
    rankMs: roundMs(rankMs),
    hydrateMs: roundMs(hydrateMs),
    corpusSource: corpusLoad.source,
    corpusCached: corpusLoad.cached,
    corpusFallbackReason: corpusLoad.fallbackReason,
    queryChars: query.length,
    termCount: effective.length,
    limit,
    resultCount: results.length,
    contentResultCount: results.filter(result => 'content' in result).length,
    corpusPages: corpus.entries.length,
    corpusTerms: corpus.documentFrequency.size,
    topUrls: results.slice(0, 5).map(result => result.url),
    ...(PERF_LOG_QUERY ? { query, terms: effective } : {}),
  });

  return {
    retrieval: 'bm25-lexical-local',
    results,
  };
}
