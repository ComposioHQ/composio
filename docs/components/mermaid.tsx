'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

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

  return (
    <div
      ref={containerRef}
      className="my-4 overflow-x-auto max-w-full mx-auto [&>svg]:mx-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
