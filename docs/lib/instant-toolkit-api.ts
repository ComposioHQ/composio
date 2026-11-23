import { z } from 'zod';
import { createComposioClient, listToolkits } from './composio-api';
import { isPublicToolkitSlug } from './public-toolkit-policy';

const toolkitsSchema = z.array(z.object({
  slug: z.string().min(1),
  instant: z.object({ supported: z.boolean() }).nullish(),
}));

/**
 * Reduces a complete /toolkits listing to its public Instant-supported slugs.
 * Throws when no toolkit carries eligibility, which means the listing is not
 * eligibility-aware rather than that no toolkit qualifies.
 */
export function instantToolkitSlugs(items: unknown[]): string[] {
  const toolkits = toolkitsSchema.parse(items);
  if (!toolkits.some(toolkit => toolkit.instant != null)) throw new Error('Toolkit eligibility missing');
  const slugs = toolkits
    .filter(toolkit => toolkit.instant?.supported === true)
    .map(toolkit => toolkit.slug.toLowerCase())
    .filter(isPublicToolkitSlug);
  return [...new Set(slugs)];
}

// Called only by the server route. Never return partial pages as a complete list.
export async function fetchInstantToolkitSlugs(apiKey: string, fetcher?: typeof fetch): Promise<string[]> {
  const client = createComposioClient(apiKey, { revalidate: 300, fetch: fetcher });
  return instantToolkitSlugs(await listToolkits(client, { signal: AbortSignal.timeout(15000) }));
}
