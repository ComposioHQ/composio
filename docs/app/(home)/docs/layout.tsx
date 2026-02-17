import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
// Insert changelog into page tree after Get Started section
const changelogPage = { type: 'page' as const, name: 'Changelog', url: '/docs/changelog' };
const children = source.pageTree.children;
const getStartedIdx = children.findIndex(
  (c) => c.type === 'separator' && c.name === 'Get Started'
);
// Find next separator after Get Started, or use end of array if not found
const nextSeparatorIdx = getStartedIdx === -1
  ? -1
  : children.findIndex((c, i) => i > getStartedIdx && c.type === 'separator');
// If we can't find proper insertion point, append at the end
const insertIdx = nextSeparatorIdx === -1 ? children.length : nextSeparatorIdx;
const pageTree = {
  ...source.pageTree,
  children: [
    ...children.slice(0, insertIdx),
    changelogPage,
    ...children.slice(insertIdx),
  ] as typeof children,
};

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={pageTree}
      nav={{ enabled: true, title: null }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
      searchToggle={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
