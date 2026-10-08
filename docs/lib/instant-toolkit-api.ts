import { z } from 'zod';
import { PRODUCTION_API_V3_URL } from '../scripts/production-api.mjs';
import { isPublicToolkitSlug } from './public-toolkit-policy';

const pageSchema = z.object({
  items: z.array(z.object({
    slug: z.string().min(1),
    instant: z.object({ supported: z.boolean() }).nullish(),
  })),
  next_cursor: z.string().nullish(),
});

// Called only by the server route. Never return partial pages as a complete list.
export async function fetchInstantToolkitSlugs(apiKey: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const slugs = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let hasEligibility = false;
  const signal = AbortSignal.timeout(15000);
  for (let page = 0; page < 12; page++) {
    const params = new URLSearchParams({ limit: '1000', include_pricing: 'true' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetcher(`${PRODUCTION_API_V3_URL}/toolkits?${params}`, {
      headers: { 'x-api-key': apiKey },
      next: { revalidate: 300 },
      signal,
    });
    if (!response.ok) throw new Error('Toolkit eligibility unavailable');
    const data = pageSchema.parse(await response.json());
    for (const toolkit of data.items) {
      if (toolkit.instant != null) hasEligibility = true;
      const slug = toolkit.slug.toLowerCase();
      if (toolkit.instant?.supported === true && isPublicToolkitSlug(slug)) slugs.add(slug);
    }
    if (!data.next_cursor) {
      if (!hasEligibility) throw new Error('Toolkit eligibility missing');
      return [...slugs];
    }
    if (cursors.has(data.next_cursor)) throw new Error('Repeated toolkit cursor');
    cursors.add(data.next_cursor);
    cursor = data.next_cursor;
  }
  throw new Error('Toolkit eligibility pagination incomplete');
}
