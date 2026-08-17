import { getReferenceSource } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { prepareTree } from '@/lib/filter-api-version';
import { buildSidebarNavIndex, type SidebarNavIndex } from '@/lib/sidebar-nav-index';
import { SidebarAnalytics } from '@/components/sidebar-analytics';

async function buildReferenceTree() {
  const source = await getReferenceSource();
  const tree = prepareTree(source.pageTree, '3.1');
  const changelogPage = { type: 'page' as const, name: 'Changelog', url: '/reference/changelog' };
  // Pin Changelog directly beneath Overview (the first/top entry) in the sidebar.
  const overviewIdx = tree.children.findIndex(
    child => child.type === 'page' && child.name === 'Overview'
  );
  const insertIdx = overviewIdx === -1 ? Math.min(1, tree.children.length) : overviewIdx + 1;

  return {
    ...tree,
    children: [
      ...tree.children.slice(0, insertIdx),
      changelogPage,
      ...tree.children.slice(insertIdx),
    ] as typeof tree.children,
  };
}

// The tree is only reachable after an await, so the index is memoized here
// rather than hoisted to module scope like the docs and examples sidebars.
let navIndex: SidebarNavIndex | undefined;

async function getNavIndex(): Promise<SidebarNavIndex> {
  navIndex ??= buildSidebarNavIndex(await buildReferenceTree());
  return navIndex;
}

export default async function Layout({ children }: { children: ReactNode }) {
  const pageTree = await buildReferenceTree();

  return (
    <DocsLayout
      tree={pageTree}
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
