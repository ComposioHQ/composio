import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { KbArticleShell } from '@/components/kb/kb-article-shell';
import { knowledgeBaseSource } from '@/lib/source';

export default function KnowledgeBaseGuideLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={knowledgeBaseSource.pageTree}
      nav={{ enabled: true, title: null }}
      searchToggle={{ enabled: false }}
      sidebar={{ enabled: false, tabs: false, footer: null }}
      themeSwitch={{ enabled: false }}
    >
      <KbArticleShell>{children}</KbArticleShell>
    </DocsLayout>
  );
}
