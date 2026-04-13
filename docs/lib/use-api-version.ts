'use client';

import { usePathname } from 'next/navigation';
import { detectApiVersion, type ApiVersion } from './api-version';

/**
 * Client hook that returns the current API version based on the URL path.
 */
export function useApiVersion(): ApiVersion {
  const pathname = usePathname();
  return detectApiVersion(pathname);
}
