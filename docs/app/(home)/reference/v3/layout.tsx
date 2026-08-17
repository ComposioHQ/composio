import { getReferenceSource } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { prepareTree } from '@/lib/filter-api-version';
import { buildSidebarNavIndex, type SidebarNavIndex } from '@/lib/sidebar-nav-index';
import { SidebarAnalytics } from '@/components/sidebar-analytics';

async function buildReferenceTree() {
  const source = await getReferenceSource();
  return prepareTree(source.pageTree, '3.0');
}

// The tree is only reachable after an await, so the index is memoized here
// rather than hoisted to module scope like the docs and examples sidebars.
let navIndex: SidebarNavIndex | undefined;

async function getNavIndex(): Promise<SidebarNavIndex> {
  navIndex ??= buildSidebarNavIndex(await buildReferenceTree());
  return navIndex;
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
      <SidebarAnalytics index={await getNavIndex()} />
      {children}
    </DocsLayout>
  );
}
