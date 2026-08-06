/**
 * Shared API version detection logic.
 * Centralizes the URL-based version detection used across components and proxy.
 */

export type ApiVersion = '3.1' | '3.0';

/**
 * REST base URL per API version. Single source of truth — the browser
 * component (`components/api-base-url.tsx`), the markdown converter
 * (`lib/source.ts`), and the version guidance constants
 * (`lib/api-version-guidance.ts`) all read it from here rather than
 * spelling the URL out again.
 */
export const API_BASE_URLS: Record<ApiVersion, string> = {
  '3.1': 'https://backend.composio.dev/api/v3.1',
  '3.0': 'https://backend.composio.dev/api/v3',
};

/**
 * Detects the API version from a pathname.
 * /reference/v3/ or /reference/v3 → '3.0', everything else → '3.1'
 */
export function detectApiVersion(pathname: string): ApiVersion {
  return pathname.startsWith('/reference/v3/') || pathname === '/reference/v3'
    ? '3.0'
    : '3.1';
}
