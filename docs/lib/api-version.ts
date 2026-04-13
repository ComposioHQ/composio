/**
 * Shared API version detection logic.
 * Centralizes the URL-based version detection used across components and proxy.
 */

export type ApiVersion = '3.1' | '3.0';

/**
 * Detects the API version from a pathname.
 * /reference/v3/ or /reference/v3 → '3.0', everything else → '3.1'
 */
export function detectApiVersion(pathname: string): ApiVersion {
  return pathname.startsWith('/reference/v3/') || pathname === '/reference/v3'
    ? '3.0'
    : '3.1';
}
