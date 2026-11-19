import { fetchWithRetry, type FetchWithRetryOptions } from './fetch-with-retry';
import { createComposioClient } from '../lib/composio-api';

interface ToolkitWithVersion {
  slug: string;
  version: string | null;
}

interface ChangelogEntry {
  slug?: string;
  versions?: Array<{ version?: string }>;
}

interface ChangelogResponse {
  items?: ChangelogEntry[];
}

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

  let data: ChangelogResponse;
  try {
    data = (await client.toolkits.retrieveChangelog()) as ChangelogResponse;
  } catch (error) {
    throw new Error(
      `Failed to fetch production toolkit changelog: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!Array.isArray(data.items)) {
    throw new Error('Production toolkit changelog response is missing an items array');
  }

  const versionMap = new Map<string, string>();

  for (const entry of data.items) {
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
