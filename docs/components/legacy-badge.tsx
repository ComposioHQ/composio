/**
 * "Legacy" badge rendered at the top of a docs page (under the title) when the
 * page frontmatter sets `legacy: true`. Used for the Direct Tool Execution
 * guides, which are superseded by sessions.
 */
export function LegacyBadge() {
  return (
    <span
      title="Legacy: superseded by sessions; kept for existing integrations"
      className="not-prose mb-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-fd-border bg-fd-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-fd-muted-foreground"
    >
      Legacy
    </span>
  );
}
