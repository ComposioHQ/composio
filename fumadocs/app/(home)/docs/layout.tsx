import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

// Add changelog to the page tree
const pageTree = {
  name: source.pageTree.name,
  children: [
    ...source.pageTree.children,
    {
      type: 'page' as const,
      name: 'Changelog',
      url: '/docs/changelog',
    },
  ],
};

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={pageTree}
      nav={{ enabled: false }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, footer: null }}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
