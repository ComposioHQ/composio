import { getReferenceSource } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { prepareTree } from '@/lib/filter-api-version';
import { buildSidebarNavIndex } from '@/lib/sidebar-nav-index';
import { SidebarAnalytics } from '@/components/sidebar-analytics';

async function buildReferenceTree() {
  const source = await getReferenceSource();
  return prepareTree(source.pageTree, '3.0');
}

export default async function Layout({ children }: { children: ReactNode }) {
  const tree = await buildReferenceTree();

  return (
    <DocsLayout
      tree={tree}
      nav={{ enabled: true, title: null }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
    >
      <SidebarAnalytics index={buildSidebarNavIndex(tree)} />
      {children}
    </DocsLayout>
  );
}
