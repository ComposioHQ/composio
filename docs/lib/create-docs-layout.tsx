import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Source = any;

export function createDocsLayout(source: Source) {
  return function Layout({ children }: { children: ReactNode }) {
    return (
      <DocsLayout
        tree={source.pageTree}
        nav={{ enabled: false, title: null }}
        searchToggle={{ enabled: false }}
        sidebar={{ collapsible: false, footer: null }}
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
    );
  };
}
