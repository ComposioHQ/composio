/**
 * "Legacy" badge rendered at the top of a docs page (under the title) when the
 * page frontmatter sets `legacy: true` — for guides superseded by sessions but
 * kept for existing integrations. The "Written <date>" stamp is separate (see
 * the `written` frontmatter field), so a current, dated guide can show its date
 * without being marked legacy.
 */
interface LegacyBadgeProps {
  title?: string;
}

export const DEPRECATED_API_LEGACY_TITLE =
  'Deprecated API endpoint; kept for existing integrations and may be removed in a future release';

export function LegacyBadge({
  title = 'Legacy: superseded by sessions; kept for existing integrations',
}: LegacyBadgeProps) {
  return (
    <span
      title={title}
      className="not-prose inline-flex w-fit items-center gap-1.5 rounded-md border border-fd-border bg-fd-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-fd-muted-foreground"
    >
      Legacy
    </span>
  );
}

export function DeprecatedApiLegacyBadge() {
  return <LegacyBadge title={DEPRECATED_API_LEGACY_TITLE} />;
}
