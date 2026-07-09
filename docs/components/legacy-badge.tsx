/**
 * "Legacy" badge rendered at the top of a docs page (under the title) when the
 * page frontmatter sets `legacy: true`. Used for the Direct Tool Execution
 * guides and the migration guides, which are point-in-time and superseded by
 * sessions. Pass `date` (frontmatter `legacyDate`) to stamp when the guide was
 * written, so readers know how current it is.
 */
export function LegacyBadge({ date }: { date?: string }) {
  const title = date
    ? `Legacy: written ${date}; superseded by sessions and kept for existing integrations`
    : 'Legacy: superseded by sessions; kept for existing integrations';
  return (
    <span
      title={title}
      className="not-prose mb-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-fd-border bg-fd-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-fd-muted-foreground"
    >
      Legacy
      {date ? (
        <span className="font-normal normal-case tracking-normal text-fd-muted-foreground/80">
          · written {date}
        </span>
      ) : null}
    </span>
  );
}
