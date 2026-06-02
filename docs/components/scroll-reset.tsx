'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Force scroll-to-top on every pathname change.
 *
 * Next.js App Router skips its built-in scroll reset when the new
 * route resolves to the same `page.tsx` segment as the current one
 * (e.g. navigating between two pages handled by
 * `app/(home)/docs/[[...slug]]/page.tsx`). The welcome page links to
 * many such siblings, so users would land mid-page on the new route.
 */
export function ScrollReset() {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
