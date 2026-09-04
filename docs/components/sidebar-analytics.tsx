'use client';

import { useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import type { SidebarNavIndex } from '@/lib/sidebar-nav-index';

/**
 * Emits `docs_sidebar_click` for sidebar navigation.
 *
 * One delegated listener rather than per-link handlers, and the group/folder/
 * depth come from `index` (built from the page tree) rather than from walking
 * the rendered DOM. An href that is not in the index emits nothing — a guessed
 * group is worse than a missing event.
 */
export function SidebarAnalytics({ index }: { index: SidebarNavIndex }) {
  const posthog = usePostHog();

  useEffect(() => {
    // `usePostHog()` falls back to the module singleton when no provider is
    // mounted, so it is truthy even with no key — capturing on it would only
    // log "You must initialize PostHog before calling posthog.capture". Gate on
    // the same env var `components/posthog-provider.tsx` gates on; Next inlines it.
    if (!posthog || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    function handleClick(event: MouseEvent) {
      // `click` skips middle-click, which would drop every sidebar link opened
      // in a new tab while keeping the Cmd/Ctrl+click ones.
      if (event.type === 'auxclick' && event.button !== 1) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      // The desktop and mobile sidebar containers. Matching `aside` instead
      // would also catch the Ask AI panel, whose answers link to docs pages.
      // These two ids are the same hooks `app/global.css` styles against.
      if (!anchor || !anchor.closest('#nd-sidebar, #nd-sidebar-mobile')) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const pathname = url.pathname.replace(/\/$/, '') || '/';
      const entry = index[pathname];
      if (!entry) return;

      posthog.capture('docs_sidebar_click', {
        href: pathname,
        group: entry.group,
        folder: entry.folder,
        depth: entry.depth,
        position: entry.position,
        from_path: window.location.pathname,
      });
    }

    document.addEventListener('click', handleClick, true);
    document.addEventListener('auxclick', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('auxclick', handleClick, true);
    };
  }, [index, posthog]);

  return null;
}
