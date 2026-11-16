import { z } from 'zod';
import authGuideRegistry from '@/kb/external-sources/auth-guides.json';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  classifyKnowledgeRecord,
  normalizeKnowledgeKeywords,
} from './metadata';

export interface AuthGuideRegistryEntry {
  slug: string;
  toolkitSlug: string;
  canonicalUrl: `https://docs.composio.dev/toolkits/${string}`;
  title: string;
  description: string;
}

function parseRegistry(value: unknown): AuthGuideRegistryEntry[] {
  // The imported snapshot retains landing URLs. Resolve destinations here so
  // refreshing that snapshot cannot restore retired routes to the search index.
  const entries = z.array(z.object({
    slug: z.string().trim().regex(/^[a-z0-9-]+$/),
    toolkitSlug: z.string().trim().regex(/^[a-z0-9_-]+$/),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })).parse(value).map((entry): AuthGuideRegistryEntry => {
    const toolkitSlug = entry.toolkitSlug === 'googleapps' ? 'googlesuper' : entry.toolkitSlug;
    return {
      ...entry,
      toolkitSlug,
      canonicalUrl: `https://docs.composio.dev/toolkits/${toolkitSlug}`,
    };
  });

  if (new Set(entries.map((entry) => entry.slug)).size !== entries.length) {
    throw new Error('OAuth guide registry contains duplicate slugs');
  }
  if (new Set(entries.map((entry) => entry.canonicalUrl)).size !== entries.length) {
    throw new Error('OAuth guide registry contains duplicate canonical URLs');
  }
  return entries;
}

const parsedRegistry = parseRegistry(authGuideRegistry);

export function getAuthGuideRegistry(): AuthGuideRegistryEntry[] {
  return parsedRegistry.map((entry) => ({ ...entry }));
}

export function getAuthGuideSearchRecords(): AlgoliaDocsRecord[] {
  return parsedRegistry.map((entry) => {
    const metadata = classifyKnowledgeRecord({
      sourceType: 'oauth-guide',
      canonicalUrl: entry.canonicalUrl,
      toolkitSlugs: [entry.toolkitSlug],
      intents: ['setup'],
    });

    return {
      objectID: `oauth-guide:${entry.slug}`,
      title: entry.title,
      description: entry.description,
      breadcrumbs: ['OAuth'],
      url: entry.canonicalUrl,
      page_id: entry.canonicalUrl,
      content: entry.description,
      keywords: normalizeKnowledgeKeywords([
        entry.slug,
        entry.toolkitSlug,
        'oauth',
        'authentication',
        'credentials',
      ]),
      slug: entry.slug,
      headings: [],
      type: 'oauth-guide',
      lang: 'en',
      page_rank: 1_700,
      toolkit_popularity: 0,
      section_rank: 120,
      position: 0,
      depth: 0,
      ...metadata,
    } satisfies AlgoliaDocsRecord;
  });
}

export async function validateAuthGuideUrls(
  entries: AuthGuideRegistryEntry[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await Promise.all(entries.map(async (entry) => {
    let response: Response;
    try {
      response = await fetchImpl(entry.canonicalUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'text/html' },
      });
    } catch (error) {
      throw new Error(`Failed to validate OAuth guide ${entry.canonicalUrl}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(
        `Failed to validate OAuth guide ${entry.canonicalUrl}: HTTP ${response.status}`,
      );
    }

    let finalUrl: string;
    try {
      const resolved = new URL(response.url);
      finalUrl = `${resolved.origin}${resolved.pathname.replace(/\/+$/, '')}`;
    } catch {
      throw new Error(
        `Failed to validate OAuth guide ${entry.canonicalUrl}: missing final response URL`,
      );
    }
    const expected = new URL(entry.canonicalUrl);
    const expectedUrl = `${expected.origin}${expected.pathname.replace(/\/+$/, '')}`;
    if (finalUrl !== expectedUrl) {
      throw new Error(
        `Failed to validate OAuth guide ${entry.canonicalUrl}: redirected to ${response.url}`,
      );
    }
  }));
}
