import type { AlgoliaDocsRecord } from '@/lib/search-index';
import { normalizeKnowledgeText } from './search';
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
