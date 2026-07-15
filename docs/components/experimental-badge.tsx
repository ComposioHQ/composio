/**
 * "Experimental" badge that signals a page's or section's APIs may change in
 * future releases, so individual pages don't need an inline callout saying the
 * same thing. Rendered under the title at the top of a docs page by default;
 * pass `inline` to sit it next to a heading on the same line.
 */
export function ExperimentalBadge({ inline = false }: { inline?: boolean }) {
  return (
    <span
      title="Experimental: these APIs may change in future releases"
      className={`not-prose inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-600/20 bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400 ${
        inline ? 'ml-3 align-middle' : 'mb-3'
      }`}
    >
      Experimental
    </span>
  );
}
