'use client';

import { usePathname } from 'next/navigation';

const BASE_URLS: Record<string, string> = {
  '3.1': 'https://backend.composio.dev/api/v3.1',
  '3.0': 'https://backend.composio.dev/api/v3',
};

/**
 * Renders the API base URL for the currently selected version.
 * Detects version from URL path (/reference/v3/ = v3.0, otherwise v3.1).
 */
export function ApiBaseUrl() {
  const pathname = usePathname();
  const version = (pathname.startsWith('/reference/v3/') || pathname === '/reference/v3') ? '3.0' : '3.1';
  return <code>{BASE_URLS[version] ?? BASE_URLS['3.1']}</code>;
}

/**
 * Renders inline text that changes based on the selected API version.
 */
export function ApiVersionText({ v31, v3 }: { v31: string; v3: string }) {
  const pathname = usePathname();
  const version = (pathname.startsWith('/reference/v3/') || pathname === '/reference/v3') ? '3.0' : '3.1';
  return <>{version === '3.0' ? v3 : v31}</>;
}
