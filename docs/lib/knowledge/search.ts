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
  | 'toolkit'
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
  section?: string | null;
}

export type KnowledgeRetrievalMode = 'hybrid' | 'semantic' | 'keyword';
export type KnowledgeDegradationReason =
  | 'embedding-unavailable'
  | 'semantic-artifact-invalid'
  | 'semantic-request-failed'
  | 'semantic-timeout'
  | 'semantic-rate-limited'
  | 'semantic-capacity-limited'
  | 'keyword-request-failed'
  | 'preview-overlay-failed';

export interface KnowledgeSearchResponse {
  query: string;
  filter: KnowledgeFilter;
  results: KnowledgeSearchResult[];
  total: number;
  mode?: KnowledgeRetrievalMode;
  strongMatch?: boolean;
}

export const KNOWLEDGE_FILTERS: readonly KnowledgeFilterDefinition[] = [
  { value: 'all', label: 'All', sourceTypes: [] },
  { value: 'docs', label: 'Docs', sourceTypes: ['docs'] },
  { value: 'kb', label: 'Knowledge Base', sourceTypes: ['kb'] },
  { value: 'oauth', label: 'OAuth', sourceTypes: ['oauth-guide'] },
  { value: 'toolkits', label: 'Toolkits', sourceTypes: ['toolkit'] },
  { value: 'reference', label: 'Reference', sourceTypes: ['reference', 'legacy'] },
] as const;

const FILTER_BY_VALUE = new Map<KnowledgeFilter, KnowledgeFilterDefinition>([
  ...KNOWLEDGE_FILTERS.map((filter) => [filter.value, filter] as const),
  ['toolkit', { value: 'toolkit', label: 'Toolkits', sourceTypes: ['toolkit'] }],
]);

export function isKnowledgeFilter(value: string): value is KnowledgeFilter {
  return FILTER_BY_VALUE.has(value as KnowledgeFilter);
}

export function algoliaFacetFilters(filter: KnowledgeFilter): string[][] {
  const sourceTypes = FILTER_BY_VALUE.get(filter)?.sourceTypes ?? [];
  return sourceTypes.length > 0
    ? [sourceTypes.map((sourceType) => `source_type:${sourceType}`)]
    : [];
}

export function knowledgeFilterIncludesSource(
  filter: KnowledgeFilter,
  sourceType: KnowledgeSourceType,
): boolean {
  const sourceTypes = FILTER_BY_VALUE.get(filter)?.sourceTypes ?? [];
  return sourceTypes.length === 0 || sourceTypes.includes(sourceType);
}

export function normalizeKnowledgeText(value: string): string {
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
  const title = normalizeKnowledgeText(record.title);
  const identity = [
    ...(record.keywords ?? []),
    record.slug ?? '',
    ...(record.tool_names ?? []),
    ...(record.tool_slugs ?? []),
    ...record.toolkit_slugs,
  ].map(normalizeKnowledgeText).filter(Boolean);
  const body = normalizeKnowledgeText([
    record.description,
    record.section,
    record.content,
    ...(record.headings ?? []),
  ].filter(Boolean).join(' '));
  return { title, identity, body, all: [title, ...identity, body].join(' ') };
}

const LOOSE_MATCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'my', 'of', 'on', 'or', 'that', 'the', 'their', 'then', 'they', 'this', 'to', 'was',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
]);

function containsToken(value: string, token: string): boolean {
  return ` ${value} `.includes(` ${token} `);
}

function textualTier(record: AlgoliaDocsRecord, normalizedQuery: string): number | null {
  const values = textValues(record);
  const tokens = normalizedQuery
    .split(' ')
    .filter(token => token && !LOOSE_MATCH_STOP_WORDS.has(token));
  if (values.title === normalizedQuery) return 6;
  if (values.identity.some((value) => value === normalizedQuery)) return 5;
  if (values.title.includes(normalizedQuery) || values.identity.some((value) => value.includes(normalizedQuery))) {
    return 4;
  }
  if (values.body.includes(normalizedQuery)) return 3;
  if (tokens.length === 0) return null;
  if (tokens.every((token) => containsToken(values.title, token) ||
    values.identity.some((value) => containsToken(value, token)))) {
    return 2;
  }
  const matchedTokens = tokens.filter(token => containsToken(values.all, token)).length;
  if (matchedTokens === tokens.length) return 1;
  const minimumLooseMatches = Math.max(2, Math.ceil(tokens.length / 2));
  if (matchedTokens >= minimumLooseMatches) return matchedTokens / tokens.length;
  return null;
}

export function filterLegacyReferenceRecords<T extends AlgoliaDocsRecord>(
  records: T[],
  query: string,
  filter: KnowledgeFilter,
): T[] {
  if (filter !== 'all' && filter !== 'reference') return records;

  const normalizedQuery = normalizeKnowledgeText(query);
  const hasCurrentExactMatch = records.some((record) => {
    if (record.source_type !== 'reference') return false;
    return (textualTier(record, normalizedQuery) ?? -1) >= 5;
  });

  return records.filter((record) => {
    if (record.source_type !== 'legacy') return true;
    return !hasCurrentExactMatch && (textualTier(record, normalizedQuery) ?? -1) >= 5;
  });
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hexadecimal = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
        return String.fromCodePoint(codePoint);
      }
      return match;
    }

    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

const HTML_TAG_NAMES = new Set([
  'a', 'abbr', 'applet', 'article', 'aside', 'audio', 'b', 'base', 'bgsound',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'code', 'col',
  'colgroup', 'datalist',
  'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe',
  'image', 'img', 'input', 'keygen', 'label', 'li', 'link', 'listing', 'main',
  'mark', 'marquee', 'math', 'meta', 'nav', 'noembed', 'noframes', 'noscript',
  'object', 'ol', 'option', 'p', 'picture', 'plaintext', 'pre', 'script',
  'section', 'select', 'small', 'source', 'span', 'strong', 'style', 'sub',
  'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea',
  'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'ul', 'video', 'xmp',
]);

function stripHtmlTags(value: string): string {
  let plainText = '';
  let cursor = 0;

  while (cursor < value.length) {
    if (value[cursor] !== '<') {
      plainText += value[cursor];
      cursor += 1;
      continue;
    }

    const remainder = value.slice(cursor);
    const candidate = remainder.match(/^<\/?([A-Za-z][A-Za-z0-9-]*)\b/);
    const isDeclaration = /^<[!?]/.test(remainder);
    const isKnownTag = HTML_TAG_NAMES.has(candidate?.[1]?.toLowerCase() ?? '');
    const isClosingTag = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>/.test(remainder);
    const hasAttributes = /^<[A-Za-z][A-Za-z0-9-]*\s+[^>]*=[^>]*\/?>/.test(remainder);
    if (!isDeclaration && !isKnownTag && !isClosingTag && !hasAttributes) {
      plainText += '<';
      cursor += 1;
      continue;
    }

    const closing = value.indexOf('>', cursor + 1);
    if (closing < 0) break;
    plainText += ' ';
    cursor = closing + 1;
  }

  return plainText;
}

export function plainKnowledgeExcerpt(value: string): string {
  let plain = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = stripHtmlTags(decodeHtmlEntities(plain));
    if (next === plain) break;
    plain = next;
  }

  return plain
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/[*~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(record: AlgoliaDocsRecord): string {
  const value = plainKnowledgeExcerpt(record.description || record.content || record.title);
  return value.length > 260 ? `${value.slice(0, 257).trimEnd()}…` : value;
}

export function knowledgeSearchResultFromRecord(
  record: AlgoliaDocsRecord,
  matchingExcerpt?: string,
): KnowledgeSearchResult {
  const sourceLabel = KNOWLEDGE_SOURCE_LABELS[record.source_type];
  const breadcrumbs = (record.breadcrumbs ?? []).filter(
    (breadcrumb, index) => index > 0 || breadcrumb.toLowerCase() !== sourceLabel.toLowerCase(),
  );
  return {
    objectID: record.objectID,
    title: record.title,
    excerpt: matchingExcerpt?.trim()
      ? plainKnowledgeExcerpt(matchingExcerpt)
      : excerpt(record),
    canonicalUrl: record.canonical_url || record.url,
    sourceType: record.source_type,
    sourceLabel,
    breadcrumbs,
    productAreas: record.product_areas,
    toolkitSlugs: record.toolkit_slugs,
    lastVerifiedAt: record.last_verified_at,
    section: record.section ?? null,
  };
}

export function searchKnowledgeRecords(
  records: AlgoliaDocsRecord[],
  request: { query: string; filter: KnowledgeFilter; limit: number },
): KnowledgeSearchResponse {
  const query = request.query.trim();
  const normalizedQuery = normalizeKnowledgeText(query);
  if (!normalizedQuery) return { query: '', filter: request.filter, results: [], total: 0 };

  const filter = FILTER_BY_VALUE.get(request.filter) ?? FILTER_BY_VALUE.get('all')!;
  const candidates = filterLegacyReferenceRecords(
    records.filter((record) =>
      filter.sourceTypes.length === 0 || filter.sourceTypes.includes(record.source_type)),
    query,
    request.filter,
  );
  const scored = candidates.flatMap((record) => {
    const tier = textualTier(record, normalizedQuery);
    if (tier === null) return [];
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
