'use client';

import { useApiVersion } from '@/lib/use-api-version';

const BASE_URLS: Record<string, string> = {
  '3.1': 'https://backend.composio.dev/api/v3.1',
  '3.0': 'https://backend.composio.dev/api/v3',
};

/**
 * Renders the API base URL for the currently selected version.
 * Detects version from URL path (/reference/v3/ = v3.0, otherwise v3.1).
 */
export function ApiBaseUrl() {
  const version = useApiVersion();
  return <code>{BASE_URLS[version] ?? BASE_URLS['3.1']}</code>;
}

