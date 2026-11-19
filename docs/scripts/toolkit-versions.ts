import { z } from 'zod';
import { fetchWithRetry, type FetchWithRetryOptions } from './fetch-with-retry';
import { createComposioClient } from '../lib/composio-api';

interface ToolkitWithVersion {
  slug: string;
  version: string | null;
}

// A malformed entry is dropped rather than failing the run; only a response
// without an items array is rejected.
const changelogEntrySchema = z
  .object({
    slug: z.string().optional().catch(undefined),
    versions: z
      .array(z.object({ version: z.string().optional().catch(undefined) }).catch({}))
      .optional()
      .catch(undefined),
  })
  .catch({});

const changelogSchema = z.object({ items: z.array(changelogEntrySchema) });

export type ToolkitVersionFetcher = (
  url: string,
  options?: FetchWithRetryOptions
) => Promise<Response>;

/** Fetch the authoritative toolkit-version map from the production API. */
export async function fetchProductionToolkitVersions(
  apiKey: string,
  fetcher: ToolkitVersionFetcher = fetchWithRetry
): Promise<Map<string, string>> {
  const client = createComposioClient(apiKey, {
    maxRetries: 0,
    timeout: 10 * 60_000,
    fetch: (input, init) => fetcher(String(input), init),
  });

  let response: unknown;
  try {
    response = await client.toolkits.retrieveChangelog();
  } catch (error) {
    throw new Error(
      `Failed to fetch production toolkit changelog: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const data = changelogSchema.safeParse(response);
  if (!data.success) {
    throw new Error('Production toolkit changelog response is missing an items array');
  }

  const versionMap = new Map<string, string>();

  for (const entry of data.data.items) {
    const slug = entry.slug?.toLowerCase();
    const latestVersion = entry.versions?.[0]?.version;
    if (slug && latestVersion) {
      versionMap.set(slug, latestVersion);
    }
  }

  if (versionMap.size === 0) {
    throw new Error('Production toolkit changelog contains no toolkit versions');
  }

  return versionMap;
}

/** Apply generator semantics: absent production changelog entries become null. */
export function applyToolkitVersions<T extends ToolkitWithVersion>(
  toolkits: T[],
  versionMap: ReadonlyMap<string, string>
): { matched: number; missing: number } {
  let matched = 0;

  for (const toolkit of toolkits) {
    const version = versionMap.get(toolkit.slug.toLowerCase()) ?? null;
    toolkit.version = version;
    if (version) matched++;
  }

  return { matched, missing: toolkits.length - matched };
}
