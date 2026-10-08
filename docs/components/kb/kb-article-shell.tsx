import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, Wrench } from 'lucide-react';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';

const browseAreas = PRODUCT_AREAS.filter((area) => area.defaultBrowse);

export function KbGuideVerification({ lastVerifiedAt }: { lastVerifiedAt: string }) {
  const verifiedDate = new Date(`${lastVerifiedAt}T12:00:00Z`);
  const label = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(verifiedDate);

  return (
    <p className="text-sm text-fd-muted-foreground">
      Last verified <time dateTime={lastVerifiedAt}>{label}</time>
    </p>
  );
}

function ArticleNavigation() {
  return (
    <nav aria-label="Knowledge Base article navigation">
      <p className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
        Support topics
      </p>
      <ul className="mt-3 space-y-1">
        {browseAreas.map((area) => (
          <li key={area.slug}>
            <Link
              href={`/kb/topic/${area.slug}`}
              className="flex gap-2.5 px-2 py-2 text-sm leading-5 text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring"
            >
              <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {area.title}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/kb/toolkits"
        className="mt-5 flex items-center gap-2 border-t border-fd-border pt-5 text-sm font-medium hover:text-fd-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
      >
        <Wrench className="size-4" aria-hidden="true" />
        Browse all toolkits
      </Link>
    </nav>
  );
}

export function KbArticleShell({ children }: { children: ReactNode }) {
  return (
    <>
      <aside className="sticky top-(--fd-docs-row-1) hidden h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] border-r border-fd-border [grid-area:sidebar] md:block md:layout:[--fd-sidebar-width:268px]">
        <div className="ms-auto w-(--fd-sidebar-width) px-6 py-10">
          <ArticleNavigation />
        </div>
      </aside>
      {children}
    </>
  );
}

export function KbMobileArticleNavigation() {
  return (
    <details className="not-prose -mx-4 -mt-6 mb-3 border-b border-fd-border px-4 py-4 md:hidden">
      <summary className="cursor-pointer text-sm font-medium">Browse Knowledge Base</summary>
      <div className="pt-5">
        <ArticleNavigation />
      </div>
    </details>
  );
}
