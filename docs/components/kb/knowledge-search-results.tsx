'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import {
  KNOWLEDGE_FILTERS,
  type KnowledgeFilter,
  type KnowledgeSearchResponse,
} from '@/lib/knowledge/search';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import { getKnowledgeSearchHref } from './knowledge-search-form';
import { SourceBadge } from './source-badge';

interface KnowledgeSearchResultsProps {
  query: string;
  filter: KnowledgeFilter;
}

function RecoveryLinks() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href="/kb#product-areas" className="border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent">
        Browse product areas
      </Link>
      <Link href="/kb/toolkits" className="border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent">
        Browse toolkits
      </Link>
    </div>
  );
}

export function KnowledgeSearchResults({ query, filter }: KnowledgeSearchResultsProps) {
  const [response, setResponse] = useState<KnowledgeSearchResponse | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!query.trim()) {
      setResponse(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    fetch(`/api/knowledge-search?q=${encodeURIComponent(query)}&filter=${filter}`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error(`Search failed: ${result.status}`);
        return result.json() as Promise<KnowledgeSearchResponse>;
      })
      .then((result) => {
        setResponse(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [query, filter]);

  return (
    <section aria-labelledby="knowledge-results-heading">
      <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-2" aria-label="Filter search results">
          {KNOWLEDGE_FILTERS.map((item) => (
            <Link
              key={item.value}
              href={getKnowledgeSearchHref(query, item.value)}
              aria-current={filter === item.value ? 'page' : undefined}
              className={`border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring ${
                filter === item.value
                  ? 'border-fd-foreground bg-fd-foreground text-fd-background'
                  : 'border-fd-border text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6" aria-live="polite">
        {!query.trim() && (
          <div>
            <h2 id="knowledge-results-heading" className="text-xl font-semibold">Start with a product area</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Search by product question, exact error, action slug, or toolkit name.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRODUCT_AREAS.filter((area) => area.defaultBrowse).map((area) => (
                <Link key={area.slug} href={`/kb/topic/${area.slug}`} className="border border-fd-border p-4 hover:bg-fd-accent/50">
                  <span className="font-medium">{area.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {state === 'loading' && (
          <div className="flex items-center gap-2 py-12 text-sm text-fd-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Searching all public knowledge…
          </div>
        )}

        {state === 'error' && (
          <div className="border border-fd-border p-6">
            <h2 id="knowledge-results-heading" className="text-lg font-semibold">Search is temporarily unavailable</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Browse the curated paths below while the search service recovers.</p>
            <RecoveryLinks />
          </div>
        )}

        {state === 'ready' && response?.results.length === 0 && (
          <div className="border border-fd-border p-6">
            <h2 id="knowledge-results-heading" className="text-lg font-semibold">No results for “{query}”</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Try a shorter error phrase, action slug, or toolkit name.</p>
            <RecoveryLinks />
          </div>
        )}

        {state === 'ready' && response && response.results.length > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="knowledge-results-heading" className="text-xl font-semibold">Results for “{query}”</h2>
              <span className="text-sm text-fd-muted-foreground">{response.total} results</span>
            </div>
            <ol className="mt-5 divide-y divide-fd-border border-y border-fd-border">
              {response.results.map((result) => (
                <li key={result.objectID}>
                  <a
                    href={result.canonicalUrl}
                    className="group block py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge sourceType={result.sourceType} />
                      {result.breadcrumbs.length > 0 && (
                        <span className="text-xs text-fd-muted-foreground">{result.breadcrumbs.join(' / ')}</span>
                      )}
                      {result.lastVerifiedAt && (
                        <span className="text-xs text-fd-muted-foreground">Verified {result.lastVerifiedAt}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-4">
                      <h3 className="text-base font-semibold group-hover:text-fd-primary sm:text-lg">{result.title}</h3>
                      <ArrowUpRight className="mt-1 size-4 shrink-0 text-fd-muted-foreground" aria-hidden="true" />
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-fd-muted-foreground">{result.excerpt}</p>
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
