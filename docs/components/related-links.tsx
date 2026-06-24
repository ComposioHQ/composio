import Link from 'next/link';

export interface RelatedLink {
  title: string;
  href: string;
  description?: string;
}

/**
 * RelatedLinks — renders in the right-hand table-of-contents rail (via the
 * DocsPage `tableOfContent.footer` slot) when a page declares `related` links
 * in its frontmatter. Keeps "see also" pointers out of the main content flow.
 */
export function RelatedLinks({ items }: { items: RelatedLink[] }) {
  if (!items?.length) return null;

  return (
    <div className="flex flex-col gap-2.5 border-t border-fd-border pt-4">
      <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-fd-muted-foreground">
        Related
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="group flex flex-col gap-0.5">
              <span className="text-sm font-medium text-fd-foreground transition-colors group-hover:text-fd-primary">
                {item.title}
              </span>
              {item.description && (
                <span className="text-xs leading-snug text-fd-muted-foreground">{item.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
