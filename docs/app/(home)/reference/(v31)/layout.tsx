import { getReferenceSource } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { prepareTree } from '@/lib/filter-api-version';

export default async function Layout({ children }: { children: ReactNode }) {
  const source = await getReferenceSource();
  const tree = prepareTree(source.pageTree, '3.1');
  const changelogPage = { type: 'page' as const, name: 'Changelog', url: '/reference/changelog' };
  const errorsIdx = tree.children.findIndex(
    (child: { type: string; name?: string }) => child.type === 'page' && child.name === 'Errors'
  );
  const insertIdx = errorsIdx === -1 ? Math.min(4, tree.children.length) : errorsIdx + 1;
  const pageTree = {
    ...tree,
    children: [
      ...tree.children.slice(0, insertIdx),
      changelogPage,
      ...tree.children.slice(insertIdx),
    ] as typeof tree.children,
  };

  return (
    <DocsLayout
      tree={pageTree}
      nav={{ enabled: true, title: null }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
