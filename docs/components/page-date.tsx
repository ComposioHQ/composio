import { formatDate } from '@/lib/source';

interface PageDateProps {
  createdAt?: string;
  updatedAt?: string;
}

export function PageDate({ createdAt, updatedAt }: PageDateProps) {
  if (!createdAt && !updatedAt) return null;

  return (
    <div className="not-prose flex flex-wrap items-center gap-3 text-xs text-fd-muted-foreground mb-2">
      {createdAt && <span>Published {formatDate(createdAt)}</span>}
      {createdAt && updatedAt && (
        <span className="h-3 w-px bg-fd-border/60" role="separator" aria-orientation="vertical" />
      )}
      {updatedAt && <span>Updated {formatDate(updatedAt)}</span>}
    </div>
  );
}
