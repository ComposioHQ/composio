import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

type Source = typeof import('./source').examplesSource;

export function createDocsLayout(source: Source) {
  return function Layout({ children }: { children: ReactNode }) {
    return (
      <DocsLayout
        tree={source.pageTree}
        nav={{ enabled: true, title: null }}
        searchToggle={{ enabled: false }}
        sidebar={{ collapsible: false, footer: null, tabs: false }}
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
    );
  };
}
