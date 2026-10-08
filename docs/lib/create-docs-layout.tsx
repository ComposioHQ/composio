import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { buildSidebarNavIndex } from './sidebar-nav-index';
import { SidebarAnalytics } from '@/components/sidebar-analytics';

type Source = typeof import('./source').examplesSource;

export function createDocsLayout(source: Source) {
  const navIndex = buildSidebarNavIndex(source.pageTree);

  return function Layout({ children }: { children: ReactNode }) {
    return (
      <DocsLayout
        tree={source.pageTree}
        nav={{ enabled: true, title: null }}
        searchToggle={{ enabled: false }}
        sidebar={{ collapsible: false, footer: null, tabs: false }}
        themeSwitch={{ enabled: false }}
      >
        <SidebarAnalytics index={navIndex} />
        {children}
      </DocsLayout>
    );
  };
}
