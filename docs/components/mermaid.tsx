'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import mermaid from 'mermaid';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Mermaid({ chart }: { chart: string }) {
  const renderCount = useRef(0);
  const baseId = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    const renderDiagram = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const orange = getCssVar('--composio-orange');
      const bg = isDark ? getCssVar('--color-fd-muted') : getCssVar('--color-fd-card');
      const fg = getCssVar('--color-fd-foreground');
      const border = getCssVar('--color-fd-border');

      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          background: bg,
          primaryColor: bg,
          primaryBorderColor: orange,
          primaryTextColor: fg,
          lineColor: orange,
          secondaryColor: bg,
          tertiaryColor: bg,
          edgeLabelBackground: bg,
          clusterBkg: bg,
          clusterBorder: border,
        },
        fontFamily: 'inherit',
      });

      const uniqueId = `${baseId.current}-${renderCount.current++}`;
      mermaid.render(uniqueId, chart).then((result) => {
        setSvg(result.svg);
      });
    };

    renderDiagram();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          renderDiagram();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, [chart]);

  const isMobile = useIsMobile();

  if (!svg) return null;

  const diagram = (
    <div
      ref={containerRef}
      className="my-4 overflow-x-auto max-w-full mx-auto [&>svg]:mx-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  if (isMobile) return diagram;

  return <Zoom wrapElement="div">{diagram}</Zoom>;
}
