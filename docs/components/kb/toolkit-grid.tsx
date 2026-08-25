'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Wrench } from 'lucide-react';
import type { ToolkitKnowledgeSummary } from '@/lib/knowledge/catalog';

const TOOLKIT_PAGE_SIZE = 60;

export function ToolkitGrid({ toolkits }: { toolkits: ToolkitKnowledgeSummary[] }) {
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(TOOLKIT_PAGE_SIZE);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filtered = useMemo(() => {
    if (!deferredQuery) return toolkits;
    return toolkits.filter((toolkit) =>
      toolkit.name.toLowerCase().includes(deferredQuery) ||
      toolkit.slug.toLowerCase().includes(deferredQuery) ||
      toolkit.category?.toLowerCase().includes(deferredQuery),
    );
  }, [deferredQuery, toolkits]);
  const visible = deferredQuery ? filtered : filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  return (
    <div>
      <label htmlFor="toolkit-search" className="mb-2 block text-sm font-medium">Search toolkits</label>
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground" aria-hidden="true" />
        <input
          id="toolkit-search"
          name="toolkit-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by toolkit name or slug"
          autoComplete="off"
          className="h-11 w-full border border-fd-border bg-fd-background pl-10 pr-4 text-sm outline-none placeholder:text-fd-muted-foreground focus-visible:border-fd-primary focus-visible:ring-2 focus-visible:ring-fd-primary/20"
        />
      </div>
      <p className="mt-3 text-sm text-fd-muted-foreground" aria-live="polite">
        {filtered.length} toolkit{filtered.length === 1 ? '' : 's'}
        {deferredQuery ? ` matching “${query.trim()}”` : ' with public knowledge'}
      </p>

      {filtered.length > 0 ? (
        <>
        <div className="mt-7 grid border-l border-t border-fd-border sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((toolkit) => (
            <Link
              key={toolkit.slug}
              href={`/kb/toolkit/${toolkit.slug}`}
              className="group flex items-center gap-4 border-b border-r border-fd-border bg-fd-background p-4 transition-colors hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring"
            >
              <span className="flex size-10 shrink-0 items-center justify-center border border-fd-border bg-fd-background">
                {toolkit.logo
                  ? <img src={toolkit.logo} alt="" width={28} height={28} className="size-7 object-contain" loading="lazy" />
                  : <Wrench className="size-5 text-fd-muted-foreground" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium group-hover:text-fd-primary">{toolkit.name}</span>
                <span className="mt-0.5 block text-xs text-fd-muted-foreground">
                  {toolkit.knowledgeCount} resource{toolkit.knowledgeCount === 1 ? '' : 's'}
                </span>
              </span>
            </Link>
          ))}
        </div>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisibleCount((current) => current + TOOLKIT_PAGE_SIZE)}
            className="mt-5 border border-fd-border px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
          >
            Show {Math.min(remaining, TOOLKIT_PAGE_SIZE)} more
          </button>
        )}
        </>
      ) : (
        <div className="mt-7 border border-fd-border p-8 text-center text-sm text-fd-muted-foreground">
          No toolkits match “{query.trim()}”.
        </div>
      )}
    </div>
  );
}
