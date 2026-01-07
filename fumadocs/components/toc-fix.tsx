'use client';

import { useEffect, useLayoutEffect } from 'react';

// Use useLayoutEffect on client to run before paint
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Force TOC sidebar to display on XL screens
 * Fumadocs sets --fd-toc-width: 0px inline which hides the TOC
 * This component overrides it immediately on mount
 */
export function TOCFix() {
  useIsomorphicLayoutEffect(() => {
    const updateTOC = () => {
      const docsLayout = document.getElementById('nd-docs-layout');
      const toc = document.getElementById('nd-toc');

      if (!docsLayout || !toc) return;

      // Only apply fix on XL screens (1280px+)
      if (window.innerWidth >= 1280) {
        // Set CSS variable with highest priority using inline style
        docsLayout.style.setProperty('--fd-toc-width', '268px', 'important');

        // Force TOC visibility
        toc.style.setProperty('display', 'flex', 'important');
        toc.style.setProperty('width', '268px', 'important');
        toc.style.setProperty('min-width', '268px', 'important');
        toc.style.setProperty('visibility', 'visible', 'important');
      } else {
        docsLayout.style.removeProperty('--fd-toc-width');
        toc.style.setProperty('display', 'none', 'important');
      }
    };

    // Run immediately
    updateTOC();

    // Run again after a short delay to catch late renders
    const timeout = setTimeout(updateTOC, 100);

    // Handle resize
    window.addEventListener('resize', updateTOC);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updateTOC);
    };
  }, []);

  return null;
}
