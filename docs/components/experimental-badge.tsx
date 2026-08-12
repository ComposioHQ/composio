import { cn } from '@/lib/utils';

/**
 * Shared lifecycle badge for experimental docs pages and API schema fields.
 * Spacing is caller-owned so it works both above a page title and inline with
 * a field name.
 */
export function ExperimentalBadge({ className }: { className?: string }) {
  return (
    <span
      title="Experimental: these APIs may change in future releases"
      className={cn(
        'not-prose inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-600/20 bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400',
        className
      )}
    >
      Experimental
    </span>
  );
}
