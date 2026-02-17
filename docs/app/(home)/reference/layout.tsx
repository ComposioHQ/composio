import { getReferenceSource } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

export default async function Layout({ children }: { children: ReactNode }) {
  const source = await getReferenceSource();
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ enabled: true, title: null }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, footer: null, tabs: false }}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
