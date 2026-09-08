import toolkitsData from '@/public/data/toolkits-list.json';
import type { ToolkitSummary } from '@/types/toolkit';
import { getAlgoliaSearchDocuments, type AlgoliaDocsRecord } from '@/lib/search-index';
import { normalizeToolkitSlug } from './metadata';
import { KNOWLEDGE_SOURCE_LABELS, type KnowledgeSourceType, type ProductAreaSlug } from './types';

export interface KnowledgeLink {
  title: string;
  description: string;
  href: string;
  sourceType: KnowledgeSourceType;
  sourceLabel: string;
  productAreas: ProductAreaSlug[];
  toolkitSlugs: string[];
  lastVerifiedAt: string | null;
}

export interface ToolkitKnowledgeSummary {
  slug: string;
  name: string;
  logo: string | null;
  category: string | null;
  knowledgeCount: number;
}

const toolkits = toolkitsData as ToolkitSummary[];
const SOURCE_ORDER: Record<KnowledgeSourceType, number> = {
  docs: 0,
  kb: 1,
  'oauth-guide': 2,
  toolkit: 3,
  example: 4,
  reference: 5,
  changelog: 6,
  legacy: 7,
};

const FEATURED_CANONICAL_URLS = [
  '/kb/guide/platform-pagination',
  '/kb/guide/platform-triggers',
  '/kb/guide/platform-custom-connection-data-fields',
  'https://composio.dev/auth/github',
] as const;

let catalogPromise: Promise<KnowledgeLink[]> | null = null;

function recordToLink(record: AlgoliaDocsRecord): KnowledgeLink {
  return {
    title: record.title,
    description: record.description || record.content || record.title,
    href: record.canonical_url,
    sourceType: record.source_type,
    sourceLabel: KNOWLEDGE_SOURCE_LABELS[record.source_type],
    productAreas: record.product_areas,
    toolkitSlugs: record.toolkit_slugs,
    lastVerifiedAt: record.last_verified_at,
  };
}

function sortLinks(links: KnowledgeLink[]): KnowledgeLink[] {
  return [...links].sort((left, right) =>
    SOURCE_ORDER[left.sourceType] - SOURCE_ORDER[right.sourceType] ||
    left.title.localeCompare(right.title),
  );
}

async function getKnowledgeCatalog(): Promise<KnowledgeLink[]> {
  catalogPromise ??= getAlgoliaSearchDocuments().then((records) => {
    const bestByCanonicalUrl = new Map<string, AlgoliaDocsRecord>();
    for (const record of records) {
      const current = bestByCanonicalUrl.get(record.canonical_url);
      if (
        !current ||
        record.page_rank > current.page_rank ||
        (record.page_rank === current.page_rank && record.section_rank > current.section_rank)
      ) {
        bestByCanonicalUrl.set(record.canonical_url, record);
      }
    }
    return sortLinks([...bestByCanonicalUrl.values()].map(recordToLink));
  });
  return catalogPromise;
}

export async function getFeaturedKnowledgeLinks(): Promise<KnowledgeLink[]> {
  const links = await getKnowledgeCatalog();
  const byUrl = new Map(links.map((link) => [link.href, link]));
  return FEATURED_CANONICAL_URLS.map((url) => {
    const link = byUrl.get(url);
    if (!link) throw new Error(`Featured knowledge URL is missing from the corpus: ${url}`);
    return link;
  });
}

export async function getKnowledgeByProductArea(
  slug: ProductAreaSlug,
): Promise<KnowledgeLink[]> {
  return (await getKnowledgeCatalog()).filter((link) => link.productAreas.includes(slug));
}

export async function getKnowledgeByToolkit(slug: string): Promise<KnowledgeLink[]> {
  const normalized = normalizeToolkitSlug(slug);
  return (await getKnowledgeCatalog()).filter((link) => link.toolkitSlugs.includes(normalized));
}

export async function getKnowledgeToolkitSummaries(): Promise<ToolkitKnowledgeSummary[]> {
  const links = await getKnowledgeCatalog();
  const counts = new Map<string, number>();
  for (const link of links) {
    for (const slug of link.toolkitSlugs) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return toolkits
    .map((toolkit) => ({
      slug: toolkit.slug,
      name: toolkit.name.trim(),
      logo: toolkit.logo,
      category: toolkit.category,
      knowledgeCount: counts.get(toolkit.slug) ?? 0,
    }))
    .filter((toolkit) => toolkit.knowledgeCount > 0);
}
