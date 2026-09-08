import { Search } from 'lucide-react';

export function getKnowledgeSearchHref(query: string): string {
  const params = new URLSearchParams({ q: query.trim() });
  return `/kb/search?${params.toString()}`;
}

interface KnowledgeSearchFormProps {
  defaultQuery?: string;
  compact?: boolean;
}

export function KnowledgeSearchForm({
  defaultQuery = '',
  compact = false,
}: KnowledgeSearchFormProps) {
  return (
    <form action="/kb/search" method="get" className="w-full">
      <label htmlFor="knowledge-search" className="sr-only">
        Search support knowledge
      </label>
      <div className={`relative flex items-stretch overflow-hidden border border-fd-border bg-fd-background shadow-sm transition focus-within:border-fd-primary focus-within:ring-2 focus-within:ring-fd-primary/20 ${compact ? 'h-12' : 'h-14 sm:h-16'}`}>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fd-muted-foreground" aria-hidden="true" />
        <input
          id="knowledge-search"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          autoComplete="off"
          placeholder="Try an action slug, error message, toolkit, or product question"
          className={`min-w-0 flex-1 bg-transparent pl-12 pr-4 text-fd-foreground outline-none placeholder:text-fd-muted-foreground ${compact ? 'text-base' : 'text-base sm:text-lg'}`}
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center border-l border-fd-border bg-fd-muted/30 px-5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring sm:px-6"
        >
          Search
        </button>
      </div>
    </form>
  );
}
