import type { Metadata } from 'next';

/** Only use for HTML pages that have a corresponding per-page Markdown route. */
export function markdownAlternates(pathname: string): Metadata['alternates'] {
  return {
    canonical: pathname,
    types: { 'text/markdown': `${pathname}.md` },
  };
}
