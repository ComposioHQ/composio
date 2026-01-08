'use client';

import { useEffect, useLayoutEffect } from 'react';

// Use useLayoutEffect on client to run before paint
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Force TOC sidebar to display on XL screens
 * Fumadocs sets --fd-toc-width: 0px which hides the TOC
 * This component uses fixed positioning to show TOC in right sidebar
 */
export function TOCFix() {
  useIsomorphicLayoutEffect(() => {
    const updateTOC = () => {
      const docsLayout = document.getElementById('nd-docs-layout');
      const toc = document.getElementById('nd-toc');

      if (!docsLayout || !toc) return;

      // Only apply fix on XL screens (1280px+)
      if (window.innerWidth >= 1280) {
        // Use fixed positioning to place TOC in right column
        toc.style.setProperty('display', 'flex', 'important');
        toc.style.setProperty('position', 'fixed', 'important');
        toc.style.setProperty('top', '80px', 'important');
        toc.style.setProperty('right', '20px', 'important');
        toc.style.setProperty('width', '240px', 'important');
        toc.style.setProperty('max-height', 'calc(100vh - 100px)', 'important');
        toc.style.setProperty('overflow-y', 'auto', 'important');
        toc.style.setProperty('visibility', 'visible', 'important');
        toc.style.setProperty('z-index', '40', 'important');
        toc.style.setProperty('flex-direction', 'column', 'important');
        toc.style.setProperty('background', 'var(--fd-background)', 'important');
        toc.style.setProperty('padding', '1rem', 'important');
        toc.style.setProperty('border-radius', '8px', 'important');
      } else {
        // Reset on smaller screens
        toc.style.removeProperty('position');
        toc.style.removeProperty('top');
        toc.style.removeProperty('right');
        toc.style.removeProperty('width');
        toc.style.removeProperty('max-height');
        toc.style.removeProperty('overflow-y');
        toc.style.removeProperty('z-index');
        toc.style.removeProperty('background');
        toc.style.removeProperty('padding');
        toc.style.removeProperty('border-radius');
        toc.style.setProperty('display', 'none', 'important');
      }
    };

    // Run immediately
    updateTOC();

    // Run again after delays to catch late renders
    const timeout1 = setTimeout(updateTOC, 100);
    const timeout2 = setTimeout(updateTOC, 500);

    // Handle resize
    window.addEventListener('resize', updateTOC);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      window.removeEventListener('resize', updateTOC);
    };
  }, []);

  return null;
}
