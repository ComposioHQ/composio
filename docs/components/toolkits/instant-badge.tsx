import { InstantBolt } from './instant-bolt';

export function InstantBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fd-muted-foreground" title="Instant is supported on the latest version">
      <InstantBolt className="size-3.5" />
      Instant
    </span>
  );
}
