import Link from 'next/link';
import type { DocsNextPage } from '@/lib/docs-next-page';

export function DocsNextLink({ page }: { page?: DocsNextPage }) {
  if (!page) return null;

  const className =
    'not-prose mt-12 inline-flex text-sm font-medium text-[var(--composio-brand)] underline decoration-transparent underline-offset-4 transition-[color,text-decoration-color] duration-150 hover:text-[var(--color-fd-foreground)] hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-4 focus-visible:ring-offset-fd-background';

  if (page.external) {
    return (
      <a href={page.url} target="_blank" rel="noopener noreferrer" className={className}>
        Next: {page.name}
      </a>
    );
  }

  return (
    <Link href={page.url} className={className}>
      Next: {page.name}
    </Link>
  );
}
