import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ enabled: false }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, footer: null }}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
