'use client';

import { useState, useMemo, useDeferredValue, useEffect, useRef } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { usePostHog } from 'posthog-js/react';
import { Search, Sparkles, Wrench, Zap, Copy, Check, ExternalLink, Grip, ShieldCheck } from 'lucide-react';
import { Card, Cards } from 'fumadocs-ui/components/card';
import toolkitsData from '@/public/data/toolkits-list.json';
import type { ToolkitSummary } from '@/types/toolkit';
import { PageActions } from '@/components/page-actions';
import {
  CATEGORY_GROUPS,
  TOOLKIT_FUSE_OPTIONS,
  groupForCategory,
  type CategoryGroup,
  type GroupFilter,
} from '@/lib/toolkit-search';

const toolkits = toolkitsData as ToolkitSummary[];

// Popular toolkit slugs (shown at top when no filters)
const POPULAR_SLUGS = [
  'github',
  'gmail',
  'slack',
  'notion',
  'googlesheets',
  'shopify',
  'googledrive',
  'supabase',
  'hubspot',
];

// PostHog event names (dot-namespaced, matching the docs convention).
const TOOLKIT_SEARCH_EVENT = 'toolkits.search';
const TOOLKIT_CATEGORY_FILTER_EVENT = 'toolkits.category_filter';

// Fire the search event this long after the user stops typing, so a single
// search intent produces one event instead of one per keystroke.
const SEARCH_EVENT_DEBOUNCE_MS = 500;

function ToolkitIcon({ toolkit, lazy = true }: { toolkit: ToolkitSummary; lazy?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = toolkit.name.trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-fd-border/50 bg-fd-background text-sm font-medium text-fd-muted-foreground sm:h-10 sm:w-10">
      {toolkit.logo && !imgFailed ? (
        <img
          src={toolkit.logo}
          alt=""
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          className="h-[65%] w-[65%] object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function CopySlugButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(slug.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${slug.toUpperCase()} to clipboard`}
      className="inline-flex items-center gap-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="max-w-[120px] truncate sm:max-w-none">{slug.toUpperCase()}</span>
      {copied ? <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function CategoryPill({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        selected
          ? 'bg-fd-foreground text-fd-background'
          : 'bg-fd-muted text-fd-muted-foreground hover:text-fd-foreground'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 opacity-60">{count}</span>}
    </button>
  );
}

function ToolkitRow({ toolkit, lazy = true }: { toolkit: ToolkitSummary; lazy?: boolean }) {
  return (
    <Link
      href={`/toolkits/${toolkit.slug}`}
      className="group flex flex-col gap-2 px-2 py-3 transition-colors hover:bg-fd-accent/30 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:py-2.5"
    >
      {/* Left side: Icon, Name, Slug */}
      <div className="flex items-center gap-3">
        <ToolkitIcon toolkit={toolkit} lazy={lazy} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="truncate text-sm font-medium text-fd-foreground">{toolkit.name.trim()}</span>
          <CopySlugButton slug={toolkit.slug} />
        </div>
      </div>
      {/* Right side: Counts */}
      <div className="flex items-center gap-3 pl-12 text-xs text-fd-muted-foreground sm:pl-0">
        <span className="flex items-center gap-1">
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
          {toolkit.toolCount}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          {toolkit.triggerCount}
        </span>
      </div>
    </Link>
  );
}

export function ToolkitsLanding() {
  const posthog = usePostHog();
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<GroupFilter>('All');
  const deferredSearch = useDeferredValue(search);
  const trimmedSearch = deferredSearch.trim();

  // Get popular toolkits
  const popularToolkits = useMemo(() => {
    return POPULAR_SLUGS
      .map((slug) => toolkits.find((t) => t.slug === slug))
      .filter((t): t is ToolkitSummary => t !== undefined);
  }, []);

  // Groups that actually have toolkits, in display order, with counts.
  const groupsWithCounts = useMemo(() => {
    const counts = new Map<CategoryGroup, number>();
    toolkits.forEach((t) => {
      const group = groupForCategory(t.category);
      counts.set(group, (counts.get(group) || 0) + 1);
    });
    return CATEGORY_GROUPS.filter((group) => counts.has(group)).map((group) => ({
      group,
      count: counts.get(group) ?? 0,
    }));
  }, []);

  // Filter by the selected category super-group.
  const categoryFiltered = useMemo(() => {
    if (selectedGroup === 'All') return toolkits;
    return toolkits.filter((t) => groupForCategory(t.category) === selectedGroup);
  }, [selectedGroup]);

  // Fuse instance scoped to the category-filtered list; rebuilt only when the
  // group changes (not on every keystroke).
  const fuse = useMemo(() => new Fuse(categoryFiltered, TOOLKIT_FUSE_OPTIONS), [categoryFiltered]);

  const filteredToolkits = useMemo(() => {
    if (!trimmedSearch) return categoryFiltered;
    return fuse.search(trimmedSearch).map((result) => result.item);
  }, [trimmedSearch, categoryFiltered, fuse]);

  // Group by first letter (numbers at end)
  const groupedToolkits = useMemo(() => {
    const groups: Record<string, ToolkitSummary[]> = {};

    // First sort all toolkits alphabetically (trim to handle leading spaces)
    const sorted = [...filteredToolkits].sort((a, b) =>
      (a.name?.trim() || '').localeCompare(b.name?.trim() || '')
    );

    sorted.forEach((toolkit) => {
      const firstChar = (toolkit.name?.trim() || '#').charAt(0).toUpperCase();
      // Group all numbers under '#'
      const letter = /[0-9]/.test(firstChar) ? '#' : firstChar;
      if (!groups[letter]) {
        groups[letter] = [];
      }
      groups[letter].push(toolkit);
    });

    // Sort groups with letters first (A-Z), then # (numbers) at end
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
  }, [filteredToolkits]);

  const hasFilters = trimmedSearch !== '' || selectedGroup !== 'All';

  const clearAll = () => {
    setSearch('');
    setSelectedGroup('All');
  };

  // Analytics — search. Debounced + deduped so one settled search = one event.
  const lastSearchKey = useRef<string | null>(null);
  useEffect(() => {
    const query = trimmedSearch.toLowerCase();
    if (!query) {
      lastSearchKey.current = null;
      return;
    }
    const key = `${query}|${selectedGroup}`;
    const timer = setTimeout(() => {
      if (lastSearchKey.current === key) return;
      lastSearchKey.current = key;
      posthog?.capture(TOOLKIT_SEARCH_EVENT, {
        query,
        query_length: query.length,
        result_count: filteredToolkits.length,
        has_results: filteredToolkits.length > 0,
        category_group: selectedGroup,
      });
    }, SEARCH_EVENT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedSearch, selectedGroup, filteredToolkits.length, posthog]);

  // Analytics — category filter. Fires on group change only (skips mount), so
  // the read-through of the latest result count/query stays accurate without
  // re-firing when search results change within the same group.
  const isInitialMount = useRef(true);
  const resultCountRef = useRef(filteredToolkits.length);
  resultCountRef.current = filteredToolkits.length;
  const queryActiveRef = useRef(trimmedSearch !== '');
  queryActiveRef.current = trimmedSearch !== '';
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    posthog?.capture(TOOLKIT_CATEGORY_FILTER_EVENT, {
      group: selectedGroup,
      result_count: resultCountRef.current,
      query_active: queryActiveRef.current,
    });
    // Intentionally keyed on selectedGroup only; other values are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fd-foreground sm:text-3xl">Toolkits</h1>
          <p className="mt-1.5 text-sm text-fd-muted-foreground sm:mt-2 sm:text-base">
            Browse {toolkits.length} toolkits supported by Composio
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PageActions path="/toolkits" variant="inline" />
          <a
            href="https://dashboard.composio.dev/~/project/playground"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-background px-3 py-1.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            Playground
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <a
            href="https://request.composio.dev/boards/tool-requests"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
          >
            <Grip className="h-3.5 w-3.5" aria-hidden="true" />
            Request Tools
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Cards */}
      <Cards>
        <Card icon={<ShieldCheck />} title="Composio Managed Auth" href="/toolkits/managed-auth" description="Check which toolkits have managed auth" />
        <Card icon={<Sparkles />} title="Pro Tools" href="/toolkits/pro-tools" description="Learn about pricing and limits" />
        <Card icon={<Wrench />} title="Meta Tools" href="/toolkits/meta-tools" description="The system tools every session gives your agent" />
      </Cards>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fd-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          name="toolkit-search"
          aria-label="Search toolkits"
          placeholder="Search toolkits…"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-lg border border-fd-border bg-fd-background pl-10 pr-4 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus-visible:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40"
        />
      </div>

      {/* Category filter */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="radiogroup"
        aria-label="Filter toolkits by category group"
      >
        <CategoryPill label="All" selected={selectedGroup === 'All'} onClick={() => setSelectedGroup('All')} />
        {groupsWithCounts.map(({ group, count }) => (
          <CategoryPill
            key={group}
            label={group}
            count={count}
            selected={selectedGroup === group}
            onClick={() => setSelectedGroup(group)}
          />
        ))}
      </div>

      {/* Results count + clear */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fd-muted-foreground">
          {filteredToolkits.length} toolkit{filteredToolkits.length !== 1 ? 's' : ''}
          {trimmedSearch && ` matching "${trimmedSearch}"`}
          {selectedGroup !== 'All' && ` in ${selectedGroup}`}
        </p>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="shrink-0 text-sm text-fd-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Popular Toolkits - only show when no filters are active */}
      {!hasFilters && popularToolkits.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-fd-muted-foreground">Popular</h2>
          <div className="divide-y divide-fd-border">
            {popularToolkits.map((toolkit) => (
              <ToolkitRow key={toolkit.slug} toolkit={toolkit} lazy={false} />
            ))}
          </div>
        </div>
      )}

      {/* Alphabetically grouped list - table style */}
      {groupedToolkits.length > 0 ? (
        <div className="space-y-6">
          {groupedToolkits.map(([letter, items]) => (
            <div key={letter}>
              <h2 className="mb-2 text-sm font-semibold text-fd-muted-foreground">{letter}</h2>
              <div className="divide-y divide-fd-border">
                {items.map((toolkit) => (
                  <ToolkitRow key={toolkit.slug} toolkit={toolkit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <p className="text-fd-muted-foreground">No toolkits found.</p>
          <button
            onClick={clearAll}
            className="mt-2 text-sm text-fd-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
