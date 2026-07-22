import { Search } from 'lucide-react';
import type { KnowledgeFilter } from '@/lib/knowledge/search';

export function getKnowledgeSearchHref(query: string, filter: KnowledgeFilter): string {
  const params = new URLSearchParams({ q: query.trim(), filter });
  return `/kb/search?${params.toString()}`;
}

interface KnowledgeSearchFormProps {
  defaultQuery?: string;
  defaultFilter?: KnowledgeFilter;
  compact?: boolean;
}

export function KnowledgeSearchForm({
  defaultQuery = '',
  defaultFilter = 'all',
  compact = false,
}: KnowledgeSearchFormProps) {
  return (
    <form action="/kb/search" method="get" className="w-full">
      <label htmlFor="knowledge-search" className="mb-2 block text-sm font-medium text-fd-foreground">
        Search product docs and support answers
      </label>
      <input type="hidden" name="filter" value={defaultFilter} />
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-4 size-5 text-fd-muted-foreground" aria-hidden="true" />
        <input
          id="knowledge-search"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          autoComplete="off"
          placeholder="Try an action slug, error message, toolkit, or product question"
          className={`w-full border border-fd-border bg-fd-background pl-12 pr-28 text-fd-foreground shadow-sm outline-none transition placeholder:text-fd-muted-foreground focus-visible:border-fd-primary focus-visible:ring-2 focus-visible:ring-fd-primary/20 ${compact ? 'h-12 text-base' : 'h-16 text-base sm:text-lg'}`}
        />
        <button
          type="submit"
          className="absolute right-2 inline-flex h-9 items-center justify-center bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2"
        >
          Search
        </button>
      </div>
    </form>
  );
}
