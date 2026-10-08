import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liteClient } from 'algoliasearch/lite';
import { z } from 'zod';
import toolkitsData from '@/public/data/toolkits-list.json';
import {
  ALGOLIA_DEFAULT_APP_ID,
  ALGOLIA_DEFAULT_INDEX_NAME,
  getAlgoliaSearchDocuments,
  type AlgoliaDocsRecord,
} from '@/lib/search-index';
import { isHiddenApiTagUrl } from '@/lib/filter-api-version';
import type { KbManifest } from '@/lib/kb/types';
import { embedTexts, embeddingContentHash } from './embeddings';
import {
  fusePublicKbCandidates,
  isStrongLexicalCandidate,
  publicKnowledgeCandidateFromSearchRecord,
  publicKnowledgeCandidateFromSemantic,
  type PublicKnowledgeCandidateRecord,
} from './hybrid-search';
import {
  docsContentHashFromRecords,
  rankSemanticCandidates,
  semanticRecordFromSearchRecord,
  validateSemanticArtifact,
  type KnowledgeSemanticArtifact,
} from './semantic-artifact';
import {
  acquireDefaultSemanticSearch,
  defaultSemanticTimeoutMs,
  type SemanticSearchAdmission,
} from './semantic-protection';
import {
  queueKnowledgeSearchAnalytics,
  type KnowledgeSearchAnalyticsEvent,
} from './query-analytics';
import { classifyKnowledgeRecord } from './metadata';
import {
  algoliaFacetFilters,
  knowledgeFilterIncludesSource,
  plainKnowledgeExcerpt,
  searchKnowledgeRecords,
  type KnowledgeDegradationReason,
  type KnowledgeFilter,
  type KnowledgeRetrievalMode,
  type KnowledgeSearchResponse,
  type KnowledgeSearchResult,
} from './search';
import type { KnowledgeSourceType } from './types';

const KNOWLEDGE_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=300';
const KNOWLEDGE_UNAVAILABLE_MESSAGE = 'Knowledge search is temporarily unavailable';
const SEMANTIC_MINIMUM_SIMILARITY = 0.3;
const PUBLISHED_TOOLKIT_CANONICAL_URLS = new Set(
  toolkitsData.map(toolkit => `/toolkits/${toolkit.slug}`),
);

const knowledgeSourceTypeSchema = z.enum([
  'docs',
  'kb',
  'oauth-guide',
  'toolkit',
  'example',
  'reference',
  'changelog',
  'legacy',
]);
const productAreaSchema = z.enum([
  'authentication-and-connected-accounts',
  'tools-actions-and-execution',
  'triggers-and-workflows',
  'sdk-api-and-mcp',
  'account-billing-and-security',
]);
const knowledgeIntentSchema = z.enum([
  'setup',
  'how-to',
  'troubleshooting',
  'limits-policy',
  'known-issue',
  'reference',
]);
const optionalStringSchema = z.string().optional().catch(undefined);
const optionalStringArraySchema = z.array(z.string()).optional().catch(undefined);
const optionalNumberSchema = z.number().finite().optional().catch(undefined);
const algoliaSearchHitSchema = z.object({
  objectID: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: optionalStringSchema,
  breadcrumbs: optionalStringArraySchema,
  url: optionalStringSchema,
  page_id: optionalStringSchema,
  section: z.string().nullable().optional().catch(undefined),
  section_id: optionalStringSchema,
  content: optionalStringSchema,
  keywords: optionalStringArraySchema,
  slug: optionalStringSchema,
  headings: optionalStringArraySchema,
  tool_names: optionalStringArraySchema,
  tool_slugs: optionalStringArraySchema,
  type: optionalStringSchema,
  lang: optionalStringSchema,
  tags: optionalStringArraySchema,
  page_rank: optionalNumberSchema,
  toolkit_popularity: optionalNumberSchema,
  section_rank: optionalNumberSchema,
  position: optionalNumberSchema,
  depth: optionalNumberSchema,
  source_type: knowledgeSourceTypeSchema.optional().catch(undefined),
  canonical_url: optionalStringSchema,
  product_areas: z.array(productAreaSchema).optional().catch(undefined),
  toolkit_slugs: optionalStringArraySchema,
  intents: z.array(knowledgeIntentSchema).optional().catch(undefined),
  last_verified_at: z.string().nullable().optional().catch(undefined),
});

const legacyTypeSources = new Map<string, KnowledgeSourceType>([
  ['docs', 'docs'],
  ['kb', 'kb'],
  ['oauth-guide', 'oauth-guide'],
  ['toolkits', 'toolkit'],
  ['examples', 'example'],
  ['reference', 'reference'],
  ['api-reference', 'reference'],
  ['v3-reference', 'legacy'],
  ['changelog', 'changelog'],
]);

const defaultTypeBySource: Record<KnowledgeSourceType, string> = {
  docs: 'docs',
  kb: 'kb',
  'oauth-guide': 'oauth-guide',
  toolkit: 'toolkits',
  example: 'examples',
  reference: 'reference',
  changelog: 'changelog',
  legacy: 'v3-reference',
};

const defaultPageRankBySource: Record<KnowledgeSourceType, number> = {
  docs: 2_000,
  kb: 1_900,
  'oauth-guide': 1_700,
  toolkit: 1_500,
  example: 1_300,
  reference: 700,
  changelog: 350,
  legacy: 25,
};

function normalizedCanonicalUrl(values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('/')) {
      const pathname = trimmed.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') || '/';
      return pathname;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      if (parsed.hostname === 'docs.composio.dev') return pathname;
      return `${parsed.origin}${pathname}`;
    } catch {
      continue;
    }
  }
  return null;
}

function pathFromCanonicalUrl(canonicalUrl: string): { pathname: string; origin: string | null } {
  if (canonicalUrl.startsWith('/')) return { pathname: canonicalUrl, origin: null };
  const parsed = new URL(canonicalUrl);
  return { pathname: parsed.pathname, origin: parsed.origin };
}

function sourceTypeFromPath(canonicalUrl: string): KnowledgeSourceType | null {
  const { pathname, origin } = pathFromCanonicalUrl(canonicalUrl);
  if (origin === 'https://composio.dev' && pathname.startsWith('/auth/')) return 'oauth-guide';
  if (origin !== null) return null;
  if (pathname === '/docs/changelog' || pathname.startsWith('/docs/changelog/')) return 'changelog';
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return 'docs';
  if (pathname === '/kb' || pathname.startsWith('/kb/')) return 'kb';
  if (pathname === '/toolkits' || pathname.startsWith('/toolkits/')) return 'toolkit';
  if (pathname === '/examples' || pathname.startsWith('/examples/')) return 'example';
  if (pathname === '/reference/v3' || pathname.startsWith('/reference/v3/')) return 'legacy';
  if (pathname === '/reference' || pathname.startsWith('/reference/')) return 'reference';
  return null;
}

function toolkitSlugsFromPath(canonicalUrl: string, sourceType: KnowledgeSourceType): string[] {
  if (sourceType !== 'toolkit') return [];
  const slug = pathFromCanonicalUrl(canonicalUrl).pathname.match(/^\/toolkits\/([^/]+)/)?.[1];
  return slug ? [slug] : [];
}

function slugFromCanonicalUrl(canonicalUrl: string): string {
  return pathFromCanonicalUrl(canonicalUrl).pathname
    .split(/[\/_-]+/)
    .filter(Boolean)
    .join(' ');
}

/** Normalizes current and pre-migration Algolia records at the external boundary. */
export function normalizeAlgoliaSearchHits(hits: unknown[]): AlgoliaDocsRecord[] {
  const records = hits.flatMap((input): AlgoliaDocsRecord[] => {
    const parsed = algoliaSearchHitSchema.safeParse(input);
    if (!parsed.success) return [];
    const hit = parsed.data;
    const canonicalUrl = normalizedCanonicalUrl([
      hit.canonical_url,
      hit.url,
      hit.page_id,
    ]);
    if (!canonicalUrl || isHiddenApiTagUrl(pathFromCanonicalUrl(canonicalUrl).pathname)) return [];

    const sourceType = hit.source_type ??
      legacyTypeSources.get(hit.type?.trim().toLowerCase() ?? '') ??
      sourceTypeFromPath(canonicalUrl);
    if (!sourceType) return [];
    if (sourceType === 'toolkit' && !PUBLISHED_TOOLKIT_CANONICAL_URLS.has(canonicalUrl)) return [];
    const metadata = classifyKnowledgeRecord({
      sourceType,
      canonicalUrl,
      productAreas: hit.product_areas,
      toolkitSlugs: hit.toolkit_slugs ?? toolkitSlugsFromPath(canonicalUrl, sourceType),
      intents: hit.intents,
      lastVerifiedAt: hit.last_verified_at,
    });

    return [{
      objectID: hit.objectID,
      title: hit.title,
      description: hit.description,
      breadcrumbs: hit.breadcrumbs ?? [],
      url: canonicalUrl,
      page_id: canonicalUrl,
      section: hit.section ?? undefined,
      section_id: hit.section_id,
      content: hit.content?.trim() || hit.description?.trim() || hit.title,
      keywords: hit.keywords ?? [],
      slug: hit.slug?.trim() || slugFromCanonicalUrl(canonicalUrl),
      headings: hit.headings ?? [],
      tool_names: hit.tool_names ?? [],
      tool_slugs: hit.tool_slugs ?? [],
      type: hit.type?.trim() || defaultTypeBySource[sourceType],
      lang: hit.lang?.trim() || 'en',
      tags: hit.tags ?? [],
      page_rank: hit.page_rank ?? defaultPageRankBySource[sourceType],
      toolkit_popularity: hit.toolkit_popularity ?? 0,
      section_rank: hit.section_rank ?? 0,
      position: hit.position ?? 0,
      depth: hit.depth ?? 0,
      ...metadata,
    }];
  });

  if (hits.length > 0 && records.length === 0) throw new Error('keyword-request-failed');
  return records;
}

export interface KeywordCandidateSearch {
  candidates: PublicKnowledgeCandidateRecord[];
  degradedReason?: KnowledgeDegradationReason;
}

export interface LocalCandidateSearch {
  candidates: PublicKnowledgeCandidateRecord[];
  canonicalUrls: string[];
}

export interface KnowledgeSearchInput {
  query: string;
  filter: KnowledgeFilter;
  headers?: Headers;
}

export interface KnowledgeSearchTimings {
  totalDurationMs: number;
  keywordDurationMs: number;
  semanticDurationMs: number | null;
}

export interface KnowledgeSearchUnavailableResponse {
  error: typeof KNOWLEDGE_UNAVAILABLE_MESSAGE;
}

export interface KnowledgeSearchExecution {
  response: KnowledgeSearchResponse | KnowledgeSearchUnavailableResponse;
  status: 200 | 503;
  cacheControl: string;
  timings: KnowledgeSearchTimings;
  previewOverlayApplied: boolean;
}

export interface KnowledgeSearchDependencies {
  hybridEnabled: () => boolean;
  searchKeywordCandidates: (
    query: string,
    filter: KnowledgeFilter,
  ) => Promise<KeywordCandidateSearch>;
  searchSemanticCandidates: (
    query: string,
    options?: { signal: AbortSignal },
  ) => Promise<PublicKnowledgeCandidateRecord[]>;
  searchLocalCandidates?: (
    query: string,
    filter: KnowledgeFilter,
  ) => Promise<PublicKnowledgeCandidateRecord[] | LocalCandidateSearch>;
  searchPreviewCandidates?: (
    query: string,
    filter: KnowledgeFilter,
  ) => Promise<PublicKnowledgeCandidateRecord[] | LocalCandidateSearch>;
  previewOverlayEnabled?: () => boolean;
  acquireSemanticSearch?: (request: Request) => SemanticSearchAdmission;
  semanticTimeoutMs?: () => number;
  captureSearch?: (event: KnowledgeSearchAnalyticsEvent) => void;
}

function filterCandidates(
  candidates: PublicKnowledgeCandidateRecord[],
  query: string,
  filter: KnowledgeFilter,
): PublicKnowledgeCandidateRecord[] {
  const filtered = candidates.filter(candidate =>
    knowledgeFilterIncludesSource(filter, candidate.sourceType ?? 'kb'));
  if (filter !== 'all' && filter !== 'reference') return filtered;

  const currentReferenceHasExactMatch = filtered.some(candidate =>
    candidate.sourceType === 'reference' && isStrongLexicalCandidate(candidate, query));
  return filtered.filter(candidate => candidate.sourceType !== 'legacy' || (
    !currentReferenceHasExactMatch && isStrongLexicalCandidate(candidate, query)
  ));
}

function overlayCandidates(
  shared: PublicKnowledgeCandidateRecord[],
  local: PublicKnowledgeCandidateRecord[],
  localCanonicalUrls: readonly string[],
): PublicKnowledgeCandidateRecord[] {
  const localByUrl = new Map(local.map(candidate => [candidate.canonicalUrl, candidate]));
  const localUrls = new Set(localCanonicalUrls);
  const sharedUrls = new Set(shared.map(candidate => candidate.canonicalUrl));
  return [
    ...shared.flatMap(candidate => {
      if (!localUrls.has(candidate.canonicalUrl)) return [candidate];
      const replacement = localByUrl.get(candidate.canonicalUrl);
      return replacement ? [replacement] : [];
    }),
    ...local.filter(candidate => !sharedUrls.has(candidate.canonicalUrl)),
  ];
}

function localCandidateSearch(
  result: PublicKnowledgeCandidateRecord[] | LocalCandidateSearch,
): LocalCandidateSearch {
  return Array.isArray(result)
    ? { candidates: result, canonicalUrls: result.map(candidate => candidate.canonicalUrl) }
    : result;
}

function excerpt(value: string): string {
  const plain = plainKnowledgeExcerpt(value);
  return plain.length > 260 ? `${plain.slice(0, 257).trimEnd()}…` : plain;
}

function resultFromCandidate(record: PublicKnowledgeCandidateRecord): KnowledgeSearchResult {
  const sourceType = record.sourceType ?? 'kb';
  const sourceLabel = record.sourceLabel ?? 'Knowledge Base';
  return {
    objectID: record.objectID,
    title: record.title,
    section: record.section,
    excerpt: excerpt(record.content || record.description || record.title),
    canonicalUrl: record.canonicalUrl,
    sourceType,
    sourceLabel,
    breadcrumbs: record.breadcrumbs.filter(
      (breadcrumb, index) => index > 0 || breadcrumb.toLowerCase() !== sourceLabel.toLowerCase(),
    ),
    productAreas: record.productAreas,
    toolkitSlugs: record.toolkitSlugs,
    lastVerifiedAt: record.lastVerifiedAt,
  };
}

function keywordResults(
  candidates: PublicKnowledgeCandidateRecord[],
): KnowledgeSearchResult[] {
  const bestByPage = new Map<string, PublicKnowledgeCandidateRecord>();
  for (const candidate of candidates) {
    const page = candidate.canonicalUrl.split('#', 1)[0] ?? candidate.canonicalUrl;
    if (!bestByPage.has(page)) bestByPage.set(page, candidate);
  }
  return [...bestByPage.values()].slice(0, 20).map(resultFromCandidate);
}

function strongKeywordResults(
  candidates: PublicKnowledgeCandidateRecord[],
  query: string,
): KnowledgeSearchResult[] {
  const strongCandidates: PublicKnowledgeCandidateRecord[] = [];
  const otherCandidates: PublicKnowledgeCandidateRecord[] = [];
  for (const candidate of candidates) {
    (isStrongLexicalCandidate(candidate, query) ? strongCandidates : otherCandidates).push(candidate);
  }
  return keywordResults([...strongCandidates, ...otherCandidates]);
}

async function defaultKeywordSearch(
  query: string,
  filter: KnowledgeFilter,
): Promise<KeywordCandidateSearch> {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? ALGOLIA_DEFAULT_APP_ID;
  const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? ALGOLIA_DEFAULT_INDEX_NAME;
  if (!appId || !searchApiKey || !indexName) throw new Error('keyword-request-failed');

  try {
    const client = liteClient(appId, searchApiKey);
    const response = await client.searchForHits<AlgoliaDocsRecord>({
      requests: [{
        type: 'default',
        indexName,
        query,
        distinct: false,
        hitsPerPage: 50,
        facetFilters: algoliaFacetFilters(filter),
        attributesToHighlight: [],
        attributesToSnippet: [],
      }],
    });
    const records = normalizeAlgoliaSearchHits(response.results[0]?.hits ?? []);
    return { candidates: records.map(publicKnowledgeCandidateFromSearchRecord) };
  } catch {
    throw new Error('keyword-request-failed');
  }
}

interface LocalPublicIndex {
  records: AlgoliaDocsRecord[];
  candidateByObjectID: Map<string, PublicKnowledgeCandidateRecord>;
  canonicalUrls: string[];
}

let localPublicIndex: Promise<LocalPublicIndex> | null = null;

function loadLocalPublicIndex(): Promise<LocalPublicIndex> {
  localPublicIndex ??= getAlgoliaSearchDocuments().then(records => {
    const candidates = records.map(publicKnowledgeCandidateFromSearchRecord);
    return {
      records,
      candidateByObjectID: new Map(candidates.map(candidate => [candidate.objectID, candidate])),
      canonicalUrls: [...new Set(candidates.map(candidate => candidate.canonicalUrl))],
    };
  });
  return localPublicIndex;
}

async function defaultLocalSearch(
  query: string,
  filter: KnowledgeFilter,
): Promise<LocalCandidateSearch> {
  const index = await loadLocalPublicIndex();
  const candidates = searchKnowledgeRecords(
    index.records,
    { query, filter, limit: 50 },
  ).results.flatMap(result => {
    const candidate = index.candidateByObjectID.get(result.objectID);
    return candidate ? [candidate] : [];
  });
  return { candidates, canonicalUrls: index.canonicalUrls };
}

async function defaultPreviewSearch(
  query: string,
  filter: KnowledgeFilter,
): Promise<LocalCandidateSearch> {
  const index = await loadLocalPublicIndex();
  const records = index.records.filter(record =>
    record.source_type === 'docs' || record.source_type === 'kb');
  const candidates = searchKnowledgeRecords(
    records,
    { query, filter, limit: 50 },
  ).results.flatMap(result => {
    const candidate = index.candidateByObjectID.get(result.objectID);
    return candidate ? [candidate] : [];
  });
  return {
    candidates,
    canonicalUrls: [...new Set(records.map(record => record.canonical_url))],
  };
}

let semanticArtifact: KnowledgeSemanticArtifact | null = null;

async function loadSemanticArtifact(): Promise<KnowledgeSemanticArtifact> {
  if (semanticArtifact) return semanticArtifact;
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'kb', 'manifest.json'), 'utf8'),
  ) as KbManifest;
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), 'kb', 'semantic-index.json'), 'utf8'),
  ) as KnowledgeSemanticArtifact;
  const records = (await getAlgoliaSearchDocuments())
    .filter(record => record.source_type === 'docs' || record.source_type === 'kb');
  const semanticRecords = records.map(semanticRecordFromSearchRecord);
  const contentHashes = new Map(
    records.map(record => [record.objectID, embeddingContentHash(record)]),
  );
  semanticArtifact = validateSemanticArtifact(artifact, {
    supportKnowledgeCommit: manifest.source.commit,
    docsContentHash: docsContentHashFromRecords(semanticRecords),
    contentHashes,
  });
  return semanticArtifact;
}

async function defaultSemanticSearch(
  query: string,
  options?: { signal: AbortSignal },
): Promise<PublicKnowledgeCandidateRecord[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('embedding-unavailable');
  let artifact: KnowledgeSemanticArtifact;
  try {
    artifact = await loadSemanticArtifact();
  } catch {
    throw new Error('semantic-artifact-invalid');
  }
  try {
    const [queryVector] = await embedTexts([query], { apiKey, signal: options?.signal });
    if (!queryVector) throw new Error('missing query vector');
    return rankSemanticCandidates(artifact, queryVector, 50, {
      minimumSimilarity: SEMANTIC_MINIMUM_SIMILARITY,
    }).map(candidate => publicKnowledgeCandidateFromSemantic(candidate.record));
  } catch (error) {
    if (options?.signal.aborted) throw error;
    throw new Error('semantic-request-failed');
  }
}

const defaultDependencies: KnowledgeSearchDependencies = {
  hybridEnabled: () => process.env.KB_HYBRID_SEARCH_ENABLED === 'true',
  searchKeywordCandidates: defaultKeywordSearch,
  searchSemanticCandidates: defaultSemanticSearch,
  searchLocalCandidates: defaultLocalSearch,
  searchPreviewCandidates: defaultPreviewSearch,
  previewOverlayEnabled: () => process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview',
  acquireSemanticSearch: acquireDefaultSemanticSearch,
  semanticTimeoutMs: defaultSemanticTimeoutMs,
  captureSearch: queueKnowledgeSearchAnalytics,
};

function degradationReason(
  error: unknown,
  fallback: KnowledgeDegradationReason,
): KnowledgeDegradationReason {
  const message = error instanceof Error ? error.message : '';
  const allowed: KnowledgeDegradationReason[] = [
    'embedding-unavailable',
    'semantic-artifact-invalid',
    'semantic-request-failed',
    'semantic-timeout',
    'semantic-rate-limited',
    'semantic-capacity-limited',
    'keyword-request-failed',
    'preview-overlay-failed',
  ];
  return allowed.includes(message as KnowledgeDegradationReason)
    ? message as KnowledgeDegradationReason
    : fallback;
}

async function protectedSemanticSearch(
  query: string,
  headers: Headers | undefined,
  dependencies: KnowledgeSearchDependencies,
): Promise<PublicKnowledgeCandidateRecord[]> {
  const request = new Request('http://localhost/api/knowledge-search', { headers });
  const admission = dependencies.acquireSemanticSearch?.(request)
    ?? { allowed: true as const, release: () => {} };
  if (!admission.allowed) throw new Error(admission.reason);

  const controller = new AbortController();
  const timeoutMs = dependencies.semanticTimeoutMs?.() ?? defaultSemanticTimeoutMs();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('semantic-timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      dependencies.searchSemanticCandidates(query, { signal: controller.signal }),
      timeout,
    ]);
  } catch (error) {
    if (timedOut) throw new Error('semantic-timeout');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    admission.release();
  }
}

function semanticEligible(filter: KnowledgeFilter): boolean {
  return filter === 'all' || filter === 'docs' || filter === 'kb';
}

function localEditorialEligible(filter: KnowledgeFilter): boolean {
  return filter === 'all' || filter === 'docs' || filter === 'kb';
}

export async function searchPublicKnowledge(
  input: KnowledgeSearchInput,
  dependencies: KnowledgeSearchDependencies = defaultDependencies,
): Promise<KnowledgeSearchExecution> {
  const query = input.query.trim().slice(0, 200);
  const startedAt = performance.now();
  let keywordDurationMs = 0;
  let semanticDurationMs: number | null = null;
  let previewOverlayApplied = false;
  let degradationCategory: KnowledgeSearchAnalyticsEvent['degradationCategory'] = null;

  const finish = (
    response: KnowledgeSearchExecution['response'],
    status: KnowledgeSearchExecution['status'],
  ): KnowledgeSearchExecution => {
    const totalDurationMs = performance.now() - startedAt;
    const results = 'results' in response ? response.results : [];
    const retrievalMode = 'mode' in response
      ? response.mode ?? 'keyword'
      : 'unavailable';
    const strongMatch = 'strongMatch' in response ? response.strongMatch ?? null : null;
    if (degradationCategory) {
      console.warn('[kb-search]', JSON.stringify({
        event: 'kb_search_degraded',
        reason: degradationCategory,
        retrievalMode,
        statusCode: status,
      }));
    }
    try {
      dependencies.captureSearch?.({
        query,
        filter: input.filter,
        retrievalMode,
        resultCount: results.length,
        resultSourceTypes: [...new Set(results.map(result => result.sourceType))],
        degradationCategory,
        strongMatch,
        statusCode: status,
        durationMs: totalDurationMs,
        keywordDurationMs,
        semanticDurationMs,
        previewOverlayApplied,
      });
    } catch {
      console.warn('[kb-search]', JSON.stringify({ event: 'kb_search_analytics_schedule_failed' }));
    }
    return {
      response,
      status,
      cacheControl: status === 200 ? KNOWLEDGE_CACHE_CONTROL : 'no-store',
      timings: { totalDurationMs, keywordDurationMs, semanticDurationMs },
      previewOverlayApplied,
    };
  };

  if (!query) {
    keywordDurationMs = performance.now() - startedAt;
    return {
      response: { query: '', filter: input.filter, results: [], total: 0 },
      status: 200,
      cacheControl: KNOWLEDGE_CACHE_CONTROL,
      timings: {
        totalDurationMs: keywordDurationMs,
        keywordDurationMs,
        semanticDurationMs: null,
      },
      previewOverlayApplied: false,
    };
  }

  const keywordStartedAt = performance.now();
  let keywordCandidates: PublicKnowledgeCandidateRecord[] | null = null;
  try {
    const keyword = await dependencies.searchKeywordCandidates(query, input.filter);
    keywordCandidates = filterCandidates(keyword.candidates, query, input.filter);
    degradationCategory = keyword.degradedReason ?? null;
  } catch (error) {
    degradationCategory = degradationReason(error, 'keyword-request-failed');
  }

  if (keywordCandidates && localEditorialEligible(input.filter) &&
    dependencies.previewOverlayEnabled?.() === true) {
    try {
      if (!dependencies.searchPreviewCandidates) throw new Error('local-index-unavailable');
      const localSearch = localCandidateSearch(
        await dependencies.searchPreviewCandidates(query, input.filter),
      );
      const previewCandidates = filterCandidates(
        localSearch.candidates,
        query,
        input.filter,
      );
      keywordCandidates = overlayCandidates(
        keywordCandidates,
        previewCandidates,
        localSearch.canonicalUrls,
      );
      previewOverlayApplied = true;
    } catch {
      degradationCategory = 'preview-overlay-failed';
    }
  }

  if (!keywordCandidates) {
    try {
      if (!dependencies.searchLocalCandidates) throw new Error('local-index-unavailable');
      const localSearch = localCandidateSearch(
        await dependencies.searchLocalCandidates(query, input.filter),
      );
      keywordCandidates = filterCandidates(localSearch.candidates, query, input.filter);
      degradationCategory = 'keyword-request-failed';
    } catch {
      keywordCandidates = null;
    }
  }
  keywordDurationMs = performance.now() - keywordStartedAt;

  const keywordWindow = keywordCandidates?.slice(0, 20) ?? null;
  const hasStrongKeywordCandidate = keywordWindow?.some(candidate =>
    isStrongLexicalCandidate(candidate, query)) === true;
  if (keywordWindow && hasStrongKeywordCandidate) {
    const results = strongKeywordResults(keywordCandidates ?? keywordWindow, query);
    return finish({
      query,
      filter: input.filter,
      results,
      total: results.length,
      mode: 'keyword',
      strongMatch: true,
    }, 200);
  }

  if (!dependencies.hybridEnabled() || !semanticEligible(input.filter)) {
    if (!keywordWindow) {
      degradationCategory = 'all-retrievers-failed';
      return finish({ error: KNOWLEDGE_UNAVAILABLE_MESSAGE }, 503);
    }
    const results = keywordResults(keywordCandidates ?? keywordWindow);
    return finish({
      query,
      filter: input.filter,
      results,
      total: results.length,
      mode: 'keyword',
    }, 200);
  }

  let semanticCandidates: PublicKnowledgeCandidateRecord[] | null = null;
  const semanticStartedAt = performance.now();
  try {
    semanticCandidates = filterCandidates(
      await protectedSemanticSearch(query, input.headers, dependencies),
      query,
      input.filter,
    ).filter(candidate => candidate.sourceType === 'docs' || candidate.sourceType === 'kb');
  } catch (error) {
    const semanticDegradation = degradationReason(error, 'semantic-request-failed');
    const isGuardrail = semanticDegradation === 'semantic-timeout' ||
      semanticDegradation === 'semantic-rate-limited' ||
      semanticDegradation === 'semantic-capacity-limited';
    if (keywordWindow && (!degradationCategory || isGuardrail)) {
      degradationCategory = semanticDegradation;
    }
  } finally {
    semanticDurationMs = performance.now() - semanticStartedAt;
  }

  if (!keywordWindow && !semanticCandidates) {
    degradationCategory = 'all-retrievers-failed';
    return finish({ error: KNOWLEDGE_UNAVAILABLE_MESSAGE }, 503);
  }

  let mode: KnowledgeRetrievalMode;
  if (keywordWindow && semanticCandidates) mode = 'hybrid';
  else if (semanticCandidates) mode = 'semantic';
  else mode = 'keyword';
  const fused = fusePublicKbCandidates({
    query,
    keyword: keywordWindow ?? [],
    semantic: semanticCandidates ?? [],
    limit: 20,
  });
  const strongMatch = semanticCandidates
    ? semanticCandidates.length > 0 || fused.some(candidate =>
      candidate.keywordRank !== null && candidate.exactTier > 0)
    : undefined;
  const results = (strongMatch === false ? [] : fused).map(candidate =>
    resultFromCandidate(candidate.record));
  return finish({
    query,
    filter: input.filter,
    results,
    total: results.length,
    mode,
    ...(strongMatch === undefined ? {} : { strongMatch }),
  }, 200);
}
