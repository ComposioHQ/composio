import { getReferenceSource } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { prepareTree } from '@/lib/filter-api-version';
import { buildSidebarNavIndex, type SidebarNavIndex } from '@/lib/sidebar-nav-index';
import { SidebarAnalytics } from '@/components/sidebar-analytics';
import type { Root } from 'fumadocs-core/page-tree';

// The reference tree is only reachable after an await, so it is memoized here
// rather than hoisted to module scope like the docs and examples sidebars.
let navIndex: SidebarNavIndex | undefined;

function getNavIndex(tree: Root): SidebarNavIndex {
  navIndex ??= buildSidebarNavIndex(tree);
  return navIndex;
}

export default async function Layout({ children }: { children: ReactNode }) {
  const source = await getReferenceSource();
  const tree = prepareTree(source.pageTree, '3.0');

  return (
    <DocsLayout
      tree={tree}
      nav={{ enabled: true, title: null }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
    >
      <SidebarAnalytics index={getNavIndex(tree)} />
      {children}
    </DocsLayout>
  );
}
