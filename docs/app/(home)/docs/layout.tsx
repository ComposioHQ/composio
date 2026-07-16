import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { decorateSidebarBadges } from '@/lib/decorate-sidebar-badges';
import { groupSidebarSections } from '@/lib/group-sidebar-sections';
import { DocsSidebarFolder } from '@/components/docs-sidebar-folder';

interface BadgeFrontmatter {
  experimental?: boolean;
  isNew?: boolean;
  legacy?: boolean;
}

const pages = source.getPages();
const experimentalUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).experimental).map((page) => page.url),
);
const newUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).isNew).map((page) => page.url),
);
const legacyUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).legacy).map((page) => page.url),
);

const tree = decorateSidebarBadges(
  groupSidebarSections(source.pageTree),
  experimentalUrls,
  newUrls,
  legacyUrls,
);

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={tree}
      nav={{ enabled: true, title: null }}
      sidebar={{
        collapsible: false,
        footer: null,
        tabs: false,
        components: { Folder: DocsSidebarFolder },
      }}
      containerProps={{ className: 'docs-section-sidebar' }}
      themeSwitch={{ enabled: false }}
      searchToggle={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
