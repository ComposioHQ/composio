import { SafeNextLink } from '@/components/safe-next-link';
import type { DocsAdjacentPages, DocsNextPage } from '@/lib/docs-next-page';

function FooterLink({
  page,
  direction,
}: {
  page: DocsNextPage;
  direction: 'previous' | 'next';
}) {
  const isNext = direction === 'next';
  const label = isNext ? 'Next' : 'Prev';

  const className =
    'group inline-flex max-w-full flex-col gap-1 rounded-md text-sm text-[var(--color-fd-muted-foreground)] transition-colors duration-150 hover:text-[var(--composio-link-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-4 focus-visible:ring-offset-fd-background ' +
    (isNext ? 'items-end text-right justify-self-end' : 'items-start text-left justify-self-start');
  const content = (
    <>
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className="truncate font-medium text-[var(--composio-brand)] transition-colors duration-150 group-hover:text-[var(--composio-link-hover)]">
        {page.name}
      </span>
    </>
  );

  if (page.external) {
    return (
      <a
        href={page.url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`${label}: ${page.name}`}
      >
        {content}
      </a>
    );
  }

  return (
    <SafeNextLink href={page.url} className={className} aria-label={`${label}: ${page.name}`}>
      {content}
    </SafeNextLink>
  );
}

export function DocsNextLink({
  page,
  previous,
  next,
}: {
  page?: DocsNextPage;
} & Partial<DocsAdjacentPages>) {
  const resolvedNext = next ?? page;
  if (!previous && !resolvedNext) return null;

  return (
    <nav
      aria-label="Page navigation"
      className="not-prose mt-12 grid grid-cols-2 items-start gap-4 border-t border-fd-border pt-6"
    >
      {previous ? <FooterLink page={previous} direction="previous" /> : <span aria-hidden="true" />}
      {resolvedNext ? <FooterLink page={resolvedNext} direction="next" /> : <span aria-hidden="true" />}
    </nav>
  );
}
