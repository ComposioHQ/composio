/**
 * "Experimental" badge rendered at the top of a docs page (under the title)
 * when the page frontmatter sets `experimental: true`. Signals that the page's
 * APIs may change in future releases, so individual pages don't need an inline
 * callout saying the same thing.
 */
export function ExperimentalBadge() {
  return (
    <span
      title="Experimental: these APIs may change in future releases"
      className="not-prose mb-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-600/20 bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400"
    >
      Experimental
    </span>
  );
}
