import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  KNOWLEDGE_SOURCE_LABELS,
  type KnowledgeSourceType,
  type ProductAreaSlug,
} from './types';

export type KnowledgeFilter =
  | 'all'
  | 'docs'
  | 'kb'
  | 'oauth'
  | 'toolkits'
  | 'reference';

export interface KnowledgeFilterDefinition {
  value: KnowledgeFilter;
  label: string;
  sourceTypes: KnowledgeSourceType[];
}

export interface KnowledgeSearchResult {
  objectID: string;
  title: string;
  excerpt: string;
  canonicalUrl: string;
  sourceType: KnowledgeSourceType;
  sourceLabel: string;
  breadcrumbs: string[];
  productAreas: ProductAreaSlug[];
  toolkitSlugs: string[];
  lastVerifiedAt: string | null;
}

export interface KnowledgeSearchResponse {
  query: string;
  filter: KnowledgeFilter;
  results: KnowledgeSearchResult[];
  total: number;
}

export const KNOWLEDGE_FILTERS: readonly KnowledgeFilterDefinition[] = [
  { value: 'all', label: 'All', sourceTypes: [] },
  { value: 'docs', label: 'Docs', sourceTypes: ['docs'] },
  { value: 'kb', label: 'Knowledge Base', sourceTypes: ['kb'] },
  { value: 'oauth', label: 'OAuth', sourceTypes: ['oauth-guide'] },
  { value: 'toolkits', label: 'Toolkits', sourceTypes: ['toolkit'] },
  { value: 'reference', label: 'Reference', sourceTypes: ['reference', 'legacy'] },
] as const;

const FILTER_BY_VALUE = new Map(KNOWLEDGE_FILTERS.map((filter) => [filter.value, filter]));

export function isKnowledgeFilter(value: string): value is KnowledgeFilter {
  return FILTER_BY_VALUE.has(value as KnowledgeFilter);
}

export function algoliaFacetFilters(filter: KnowledgeFilter): string[][] {
  const sourceTypes = FILTER_BY_VALUE.get(filter)?.sourceTypes ?? [];
  return sourceTypes.length > 0
    ? [sourceTypes.map((sourceType) => `source_type:${sourceType}`)]
    : [];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textValues(record: AlgoliaDocsRecord): {
  title: string;
  identity: string[];
  body: string;
  all: string;
} {
  const title = normalize(record.title);
  const identity = [
    ...(record.keywords ?? []),
    record.slug ?? '',
    ...(record.tool_names ?? []),
    ...(record.tool_slugs ?? []),
    ...record.toolkit_slugs,
  ].map(normalize).filter(Boolean);
  const body = normalize([
    record.description,
    record.section,
    record.content,
    ...(record.headings ?? []),
  ].filter(Boolean).join(' '));
  return { title, identity, body, all: [title, ...identity, body].join(' ') };
}

function textualTier(record: AlgoliaDocsRecord, normalizedQuery: string): number | null {
  const values = textValues(record);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (values.title === normalizedQuery) return 6;
  if (values.identity.some((value) => value === normalizedQuery)) return 5;
  if (values.title.includes(normalizedQuery) || values.identity.some((value) => value.includes(normalizedQuery))) {
    return 4;
  }
  if (values.body.includes(normalizedQuery)) return 3;
  if (tokens.every((token) => values.title.includes(token) || values.identity.some((value) => value.includes(token)))) {
    return 2;
  }
  if (tokens.every((token) => values.all.includes(token))) return 1;
  if (tokens.some((token) => values.all.includes(token))) return 0;
  return null;
}

function excerpt(record: AlgoliaDocsRecord): string {
  const value = (record.description || record.content || record.title).replace(/\s+/g, ' ').trim();
  return value.length > 260 ? `${value.slice(0, 257).trimEnd()}…` : value;
}

export function knowledgeSearchResultFromRecord(
  record: AlgoliaDocsRecord,
  matchingExcerpt?: string,
): KnowledgeSearchResult {
  return {
    objectID: record.objectID,
    title: record.title,
    excerpt: matchingExcerpt?.trim() || excerpt(record),
    canonicalUrl: record.canonical_url || record.url,
    sourceType: record.source_type,
    sourceLabel: KNOWLEDGE_SOURCE_LABELS[record.source_type],
    breadcrumbs: record.breadcrumbs ?? [],
    productAreas: record.product_areas,
    toolkitSlugs: record.toolkit_slugs,
    lastVerifiedAt: record.last_verified_at,
  };
}

export function searchKnowledgeRecords(
  records: AlgoliaDocsRecord[],
  request: { query: string; filter: KnowledgeFilter; limit: number },
): KnowledgeSearchResponse {
  const query = request.query.trim();
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { query: '', filter: request.filter, results: [], total: 0 };

  const filter = FILTER_BY_VALUE.get(request.filter) ?? FILTER_BY_VALUE.get('all')!;
  const scored = records.flatMap((record) => {
    if (filter.sourceTypes.length > 0 && !filter.sourceTypes.includes(record.source_type)) return [];
    const tier = textualTier(record, normalizedQuery);
    if (tier === null) return [];
    if (request.filter === 'reference' && record.source_type === 'legacy' && tier < 5) return [];
    return [{ record, tier }];
  });

  const bestByCanonicalUrl = new Map<string, (typeof scored)[number]>();
  for (const candidate of scored) {
    const key = candidate.record.canonical_url || candidate.record.url;
    const current = bestByCanonicalUrl.get(key);
    if (
      !current ||
      candidate.tier > current.tier ||
      (candidate.tier === current.tier && candidate.record.section_rank > current.record.section_rank)
    ) {
      bestByCanonicalUrl.set(key, candidate);
    }
  }

  const ranked = [...bestByCanonicalUrl.values()].sort((left, right) =>
    right.tier - left.tier ||
    right.record.page_rank - left.record.page_rank ||
    right.record.toolkit_popularity - left.record.toolkit_popularity ||
    right.record.section_rank - left.record.section_rank ||
    left.record.title.localeCompare(right.record.title),
  );

  return {
    query,
    filter: request.filter,
    results: ranked.slice(0, Math.max(0, request.limit)).map(({ record }) =>
      knowledgeSearchResultFromRecord(record)),
    total: ranked.length,
  };
}
