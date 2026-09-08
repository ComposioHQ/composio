import type { AlgoliaDocsRecord } from '@/lib/search-index';
import { normalizeKnowledgeText } from './search';
import type { KnowledgeSemanticRecord } from './semantic-artifact';
import {
  KNOWLEDGE_SOURCE_LABELS,
  type KnowledgeSourceType,
  type ProductAreaSlug,
} from './types';

export interface PublicKnowledgeCandidateRecord {
  objectID: string;
  sourceType: KnowledgeSourceType;
  sourceLabel: string;
  pageID: string;
  title: string;
  section: string | null;
  description: string;
  content: string;
  canonicalUrl: string;
  breadcrumbs: string[];
  productAreas: ProductAreaSlug[];
  toolkitSlugs: string[];
  keywords: string[];
  slug: string;
  toolNames: string[];
  toolSlugs: string[];
  pageRank: number;
  sectionRank: number;
  lastVerifiedAt: string | null;
}

/** @deprecated Use PublicKnowledgeCandidateRecord. */
export type PublicKbCandidateRecord = PublicKnowledgeCandidateRecord;

export interface FusedKnowledgeCandidate {
  record: PublicKnowledgeCandidateRecord;
  exactTier: number;
  rrfScore: number;
  keywordRank: number | null;
  semanticRank: number | null;
}

/** Converts any record classified for the public index into a keyword candidate. */
export function publicKnowledgeCandidateFromSearchRecord(
  record: AlgoliaDocsRecord,
): PublicKnowledgeCandidateRecord {
  return {
    objectID: record.objectID,
    sourceType: record.source_type,
    sourceLabel: KNOWLEDGE_SOURCE_LABELS[record.source_type],
    pageID: record.page_id,
    title: record.title,
    section: record.section ?? null,
    description: record.description ?? '',
    content: record.content,
    canonicalUrl: record.canonical_url,
    breadcrumbs: record.breadcrumbs ?? [],
    productAreas: record.product_areas,
    toolkitSlugs: record.toolkit_slugs,
    keywords: record.keywords ?? [],
    slug: record.slug ?? '',
    toolNames: record.tool_names ?? [],
    toolSlugs: record.tool_slugs ?? [],
    pageRank: record.page_rank,
    sectionRank: record.section_rank,
    lastVerifiedAt: record.last_verified_at,
  };
}

/** @deprecated Use publicKnowledgeCandidateFromSearchRecord. */
export function publicKbCandidateFromAlgolia(record: AlgoliaDocsRecord): PublicKnowledgeCandidateRecord {
  if (record.source_type !== 'kb') throw new Error(`Expected a KB record: ${record.objectID}`);
  return publicKnowledgeCandidateFromSearchRecord(record);
}

export function publicKnowledgeCandidateFromSemantic(
  record: KnowledgeSemanticRecord,
): PublicKnowledgeCandidateRecord {
  return {
    objectID: record.objectID,
    sourceType: record.sourceType,
    sourceLabel: record.sourceLabel,
    pageID: record.pageID,
    title: record.title,
    section: record.section,
    description: record.description,
    content: record.content,
    canonicalUrl: record.canonicalUrl,
    breadcrumbs: record.breadcrumbs,
    productAreas: record.productAreas,
    toolkitSlugs: record.toolkitSlugs,
    keywords: record.keywords,
    slug: record.slug,
    toolNames: record.toolNames,
    toolSlugs: record.toolSlugs,
    pageRank: record.pageRank,
    sectionRank: record.sectionRank,
    lastVerifiedAt: record.lastVerifiedAt,
  };
}

/** @deprecated Use publicKnowledgeCandidateFromSemantic. */
export const publicKbCandidateFromSemantic = publicKnowledgeCandidateFromSemantic;

export function isStrongLexicalCandidate(
  record: PublicKnowledgeCandidateRecord,
  query: string,
): boolean {
  const normalizedQuery = normalizeKnowledgeText(query);
  if (!normalizedQuery) return false;
  const title = normalizeKnowledgeText(record.title);
  if (title === normalizedQuery) return true;
  const identity = [
    ...record.keywords,
    record.slug,
    ...record.toolNames,
    ...record.toolSlugs,
    ...record.toolkitSlugs,
  ].map(normalizeKnowledgeText).filter(Boolean);
  return identity.some(value => value === normalizedQuery);
}

function exactTier(record: PublicKnowledgeCandidateRecord, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  if (isStrongLexicalCandidate(record, normalizedQuery)) {
    return normalizeKnowledgeText(record.title) === normalizedQuery ? 3 : 2;
  }
  const title = normalizeKnowledgeText(record.title);
  const identity = [
    ...record.keywords,
    record.slug,
    ...record.toolNames,
    ...record.toolSlugs,
    ...record.toolkitSlugs,
  ].map(normalizeKnowledgeText).filter(Boolean);
  const phraseFields = [title, ...identity, normalizeKnowledgeText(record.section ?? ''),
    normalizeKnowledgeText(record.description), normalizeKnowledgeText(record.content)];
  if (phraseFields.some(value => value.includes(normalizedQuery))) return 1;
  return 0;
}

function canonicalPage(url: string): string {
  return url.split('#', 1)[0] ?? url;
}

export function fusePublicKbCandidates(input: {
  query: string;
  keyword: PublicKnowledgeCandidateRecord[];
  semantic: PublicKnowledgeCandidateRecord[];
  limit: number;
  rrfConstant?: number;
}): FusedKnowledgeCandidate[] {
  const rrfConstant = input.rrfConstant ?? 60;
  const byObjectID = new Map<string, FusedKnowledgeCandidate>();
  const add = (
    record: PublicKnowledgeCandidateRecord,
    source: 'keyword' | 'semantic',
    rank: number,
  ) => {
    const current = byObjectID.get(record.objectID) ?? {
      record,
      exactTier: exactTier(record, normalizeKnowledgeText(input.query)),
      rrfScore: 0,
      keywordRank: null,
      semanticRank: null,
    };
    current.rrfScore += 1 / (rrfConstant + rank);
    if (source === 'keyword') current.keywordRank = rank;
    else current.semanticRank = rank;
    byObjectID.set(record.objectID, current);
  };
  input.keyword.slice(0, 50).forEach((record, index) => add(record, 'keyword', index + 1));
  input.semantic.slice(0, 50).forEach((record, index) => add(record, 'semantic', index + 1));

  const ranked = [...byObjectID.values()].sort((left, right) =>
    right.exactTier - left.exactTier ||
    right.rrfScore - left.rrfScore ||
    right.record.pageRank - left.record.pageRank ||
    right.record.sectionRank - left.record.sectionRank ||
    left.record.title.localeCompare(right.record.title) ||
    left.record.objectID.localeCompare(right.record.objectID),
  );
  const bestByPage = new Map<string, FusedKnowledgeCandidate>();
  for (const candidate of ranked) {
    const page = canonicalPage(candidate.record.canonicalUrl);
    if (!bestByPage.has(page)) bestByPage.set(page, candidate);
  }
  return [...bestByPage.values()].slice(0, Math.min(Math.max(0, input.limit), 20));
}

/** @deprecated Use FusedKnowledgeCandidate. */
export type FusedKbCandidate = FusedKnowledgeCandidate;
