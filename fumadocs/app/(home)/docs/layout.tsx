import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

// Insert changelog into page tree at correct position (after capabilities, before Tools and Triggers)
const changelogPage = { type: 'page' as const, name: 'Changelog', url: '/docs/changelog' };
const pageTree = {
  ...source.pageTree,
  children: source.pageTree.children.flatMap((child) =>
    child.type === 'separator' && child.name === 'Tools and Triggers'
      ? [changelogPage, child]
      : [child]
  ) as typeof source.pageTree.children,
};

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={pageTree}
      nav={{ enabled: false, title: null }}
      searchToggle={{ enabled: true }}
      sidebar={{ collapsible: false, footer: null }}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
