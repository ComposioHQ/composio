'use client';

import { useApiVersion } from '@/lib/use-api-version';
import { API_BASE_URLS } from '@/lib/api-version';

/**
 * Renders the API base URL for the currently selected version.
 * Detects version from URL path (/reference/v3/ = v3.0, otherwise v3.1).
 *
 * The `.md` channel renders this tag through `mdxToCleanMarkdown`, which reads
 * the same `API_BASE_URLS` map — the browser and the agent see one URL.
 */
export function ApiBaseUrl() {
  const version = useApiVersion();
  return <code>{API_BASE_URLS[version] ?? API_BASE_URLS['3.1']}</code>;
}

