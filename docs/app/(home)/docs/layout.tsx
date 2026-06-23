import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { decorateExperimentalPages } from '@/lib/decorate-experimental';

interface ExperimentalFrontmatter {
  experimental?: boolean;
}

const experimentalUrls = new Set(
  source
    .getPages()
    .filter((page) => (page.data as ExperimentalFrontmatter).experimental)
    .map((page) => page.url),
);

const tree = decorateExperimentalPages(source.pageTree, experimentalUrls);

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={tree}
      nav={{ enabled: true, title: null }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
      searchToggle={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
