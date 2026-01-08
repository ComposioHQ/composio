'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RelatedPage {
  /**
   * Page title
   */
  title: string;
  /**
   * Page URL
   */
  href: string;
  /**
   * Optional description
   */
  description?: string;
}

interface RelatedPagesProps {
  /**
   * Array of related pages to display
   */
  pages: RelatedPage[];
  /**
   * Section title
   * @default "Related Guides"
   */
  title?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Related pages component for cross-linking documentation
 *
 * Displays a list of related guides at the bottom of a page
 * to help users discover relevant content.
 *
 * Usage in MDX:
 * ```mdx
 * <RelatedPages
 *   pages={[
 *     { title: "Authentication", href: "/docs/authentication" },
 *     { title: "API Reference", href: "/reference" },
 *   ]}
 * />
 * ```
 *
 * Or with descriptions:
 * ```mdx
 * <RelatedPages
 *   title="Continue Learning"
 *   pages={[
 *     {
 *       title: "Authentication",
 *       href: "/docs/authentication",
 *       description: "Learn how to authenticate users"
 *     },
 *   ]}
 * />
 * ```
 */
export function RelatedPages({
  pages,
  title = 'Related Guides',
  className,
}: RelatedPagesProps) {
  if (!pages || pages.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        'related-pages mt-12 pt-8 border-t border-fd-border',
        className
      )}
      aria-labelledby="related-pages-heading"
    >
      <h2
        id="related-pages-heading"
        className="flex items-center gap-2 mb-4 text-lg font-semibold text-fd-foreground"
      >
        <BookOpen className="w-5 h-5 text-fd-muted-foreground" />
        {title}
      </h2>

      <ul className="grid gap-3 sm:grid-cols-2">
        {pages.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className={cn(
                'group flex items-start gap-3 p-4 rounded-lg',
                'border border-fd-border bg-fd-card',
                'hover:border-composio-orange/50 hover:bg-fd-accent/50',
                'transition-colors'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-fd-foreground group-hover:text-composio-orange transition-colors">
                  {page.title}
                </p>
                {page.description && (
                  <p className="mt-1 text-sm text-fd-muted-foreground line-clamp-2">
                    {page.description}
                  </p>
                )}
              </div>
              <ArrowRight
                className={cn(
                  'w-4 h-4 mt-1 text-fd-muted-foreground',
                  'group-hover:text-composio-orange group-hover:translate-x-0.5',
                  'transition-all'
                )}
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Simple inline link list for related content
 */
export function RelatedLinks({
  pages,
  title = 'See also',
  className,
}: RelatedPagesProps) {
  if (!pages || pages.length === 0) {
    return null;
  }

  return (
    <div className={cn('related-links my-4', className)}>
      <span className="text-sm font-medium text-fd-muted-foreground">
        {title}:{' '}
      </span>
      {pages.map((page, index) => (
        <React.Fragment key={page.href}>
          <Link
            href={page.href}
            className="text-sm text-composio-orange hover:underline"
          >
            {page.title}
          </Link>
          {index < pages.length - 1 && (
            <span className="text-fd-muted-foreground">, </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
