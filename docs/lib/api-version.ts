/**
 * Shared API version detection logic.
 * Centralizes the URL-based version detection used across components and proxy.
 */

export type ApiVersion = '3.1' | '3.0';
export type ReferenceApiVersion = ApiVersion | null;

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

/** True for reference pages that describe the REST API. */
export function isReferenceUrl(pathname: string): boolean {
  return (
    pathname !== '/reference/glossary' &&
    pathname !== '/reference/sdk-reference' &&
    !pathname.startsWith('/reference/sdk-reference/') &&
    (pathname === '/reference' || pathname.startsWith('/reference/'))
  );
}

/** The REST version described by a reference page, or null for SDK/glossary pages. */
export function detectReferenceApiVersion(pathname: string): ReferenceApiVersion {
  return isReferenceUrl(pathname) ? detectApiVersion(pathname) : null;
}

const CURRENT_VERSION_URLS: Record<string, string> = {
  '/reference/v3/authentication': '/reference/authenticating-to-composio',
};

/**
 * The current-version URL for a legacy-tree page, so an agent reading a v3.0
 * page can be pointed at the same operation on v3.1. Any other pathname is
 * returned unchanged.
 */
export function toCurrentVersionUrl(pathname: string): string {
  if (CURRENT_VERSION_URLS[pathname]) return CURRENT_VERSION_URLS[pathname];
  if (pathname === '/reference/v3') return '/reference';
  if (pathname.startsWith('/reference/v3/')) {
    return `/reference/${pathname.slice('/reference/v3/'.length)}`;
  }
  return pathname;
}
