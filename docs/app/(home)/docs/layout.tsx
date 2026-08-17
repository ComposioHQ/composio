import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { decorateSidebarBadges } from '@/lib/decorate-sidebar-badges';
import { buildSidebarNavIndex } from '@/lib/sidebar-nav-index';
import { SidebarAnalytics } from '@/components/sidebar-analytics';

interface BadgeFrontmatter {
  experimental?: boolean;
  isNew?: boolean;
}

const pages = source.getPages();
const experimentalUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).experimental).map((page) => page.url),
);
const newUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).isNew).map((page) => page.url),
);

const tree = decorateSidebarBadges(source.pageTree, experimentalUrls, newUrls);
const navIndex = buildSidebarNavIndex(tree);

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={tree}
      nav={{ enabled: true, title: null }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
      searchToggle={{ enabled: false }}
    >
      <SidebarAnalytics index={navIndex} />
      {children}
    </DocsLayout>
  );
}
