'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import type {
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '@/lib/knowledge/search';
import { plainKnowledgeExcerpt } from '@/lib/knowledge/search';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import { getKnowledgeDisplayDescription } from '@/lib/knowledge/display';

interface KnowledgeSearchResultsProps {
  query: string;
  initialResponse: KnowledgeSearchResponse | null;
  failed: boolean;
}

export function getHighlightedSegments(
  text: string,
  query: string,
): Array<{ text: string; highlighted: boolean }> {
  const terms = [...new Set(
    query.toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [],
  )].sort((left, right) => right.length - left.length);
  if (terms.length === 0) return [{ text, highlighted: false }];

  const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
  return text.split(pattern).filter(Boolean).map((segment) => ({
    text: segment,
    highlighted: terms.includes(segment.toLowerCase()),
  }));
}

export function getKnowledgeSearchDisplayExcerpt(
  excerpt: string,
  section?: string | null,
): string {
  const displayExcerpt = plainKnowledgeExcerpt(getKnowledgeDisplayDescription(excerpt));
  const sectionTitle = section ? plainKnowledgeExcerpt(section) : '';
  if (!sectionTitle || !displayExcerpt.toLowerCase().startsWith(sectionTitle.toLowerCase())) {
    return displayExcerpt;
  }

  const remainder = displayExcerpt.slice(sectionTitle.length);
  if (!remainder) return '';
  if (!/^[\s,:;–—-]/.test(remainder)) return displayExcerpt;

  const hadLeadingWhitespace = /^\s/.test(remainder);
  const trimmedRemainder = remainder.trimStart();
  if (!hadLeadingWhitespace && /^-\S/.test(trimmedRemainder)) return displayExcerpt;

  return trimmedRemainder
    .replace(/^(?:[:,;]|[–—]|-\s*)/, '')
    .trimStart();
}

function getKnowledgeSearchDisplaySection(
  title: string,
  section?: string | null,
): string | null {
  const sectionTitle = section ? plainKnowledgeExcerpt(section) : '';
  const displaySection = sectionTitle.replace(/[,:;]+$/, '').trimEnd();
  if (!displaySection || displaySection.toLowerCase() === title.trim().toLowerCase()) {
    return null;
  }

  return displaySection;
}

export function getKnowledgeSearchSourceLabel(sourceType: KnowledgeSourceType): string {
  switch (sourceType) {
    case 'docs':
      return 'Documentation';
    case 'kb':
      return 'Support';
    case 'oauth-guide':
      return 'OAuth';
    case 'toolkit':
      return 'Toolkit';
    case 'example':
      return 'Example';
    case 'reference':
      return 'API Reference';
    case 'changelog':
      return 'Changelog';
    case 'legacy':
      return 'Legacy API Reference';
  }
}

export function KnowledgeSearchResultCard({
  result,
  query,
  onClick,
}: {
  result: KnowledgeSearchResult;
  query: string;
  onClick?: () => void;
}) {
  const sourceLabel = getKnowledgeSearchSourceLabel(result.sourceType);
  const displaySection = getKnowledgeSearchDisplaySection(result.title, result.section);
  const displayExcerpt = getKnowledgeSearchDisplayExcerpt(result.excerpt, result.section);

  return (
    <a
      href={result.canonicalUrl}
      onClick={onClick}
      className="group block border border-fd-border bg-fd-background p-5 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
        {sourceLabel}
      </span>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold group-hover:text-fd-primary sm:text-lg">
          {getHighlightedSegments(result.title, query).map((segment, segmentIndex) => (
            segment.highlighted
              ? <mark key={segmentIndex} className="bg-fd-primary/15 text-inherit">{segment.text}</mark>
              : segment.text
          ))}
        </h3>
        <ArrowUpRight className="mt-1 size-4 shrink-0 text-fd-muted-foreground" aria-hidden="true" />
      </div>
      {displaySection && (
        <p className="mt-1 text-sm font-medium text-fd-foreground/80">
          {getHighlightedSegments(displaySection, query).map((segment, segmentIndex) => (
            segment.highlighted
              ? <mark key={segmentIndex} className="bg-fd-primary/15 text-inherit">{segment.text}</mark>
              : segment.text
          ))}
        </p>
      )}
      {displayExcerpt && (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-fd-muted-foreground">
          {getHighlightedSegments(displayExcerpt, query).map((segment, segmentIndex) => (
            segment.highlighted
              ? <mark key={segmentIndex} className="bg-fd-primary/15 text-inherit">{segment.text}</mark>
              : segment.text
          ))}
        </p>
      )}
    </a>
  );
}

function RecoveryLinks() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href="/kb#support-topics" className="border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent">
        Browse support topics
      </Link>
      <Link href="/kb/toolkits" className="border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent">
        Browse toolkits
      </Link>
    </div>
  );
}

export function KnowledgeSearchResults({
  query,
  initialResponse,
  failed,
}: KnowledgeSearchResultsProps) {
  const normalizedQuery = query.trim();
  const posthog = usePostHog();
  const state: 'idle' | 'ready' | 'error' = !normalizedQuery
    ? 'idle'
    : failed || initialResponse === null
      ? 'error'
      : 'ready';
  const response = state === 'ready' ? initialResponse : null;

  return (
    <section aria-label="Knowledge search results">
      <div aria-live="polite">
        {!normalizedQuery && (
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

        {state === 'error' && (
          <div className="border border-fd-border bg-fd-muted/20 p-6">
            <h2 id="knowledge-results-heading" className="text-lg font-semibold">Search is temporarily unavailable</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Browse the curated paths below while the search service recovers.</p>
            <RecoveryLinks />
          </div>
        )}

        {state === 'ready' && response?.results.length === 0 && (
          <div className="border border-fd-border bg-fd-muted/20 p-6">
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
            <ol className="mt-5 grid gap-3">
              {response.results.map((result, index) => (
                <li key={result.objectID}>
                  <KnowledgeSearchResultCard
                    result={result}
                    query={query}
                    onClick={() => posthog?.capture('kb_search_result_clicked', {
                      object_id: result.objectID,
                      displayed_position: index + 1,
                      retrieval_mode: response.mode ?? 'keyword',
                      source_type: result.sourceType,
                    })}
                  />
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
