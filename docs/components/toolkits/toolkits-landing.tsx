'use client';

import { useState, useMemo, useDeferredValue } from 'react';
import Link from 'next/link';
import { Search, Sparkles, Wrench, Zap, Copy, Check, ExternalLink, Grip, ShieldCheck } from 'lucide-react';
import { Card, Cards } from 'fumadocs-ui/components/card';
import toolkitsData from '@/public/data/toolkits-list.json';
import type { ToolkitSummary } from '@/types/toolkit';
import { PageActions } from '@/components/page-actions';

const toolkits = toolkitsData as ToolkitSummary[];

const CATEGORY_GROUPS = [
  {
    id: 'all',
    label: 'All',
    categories: null,
  },
  {
    id: 'developer',
    label: 'Developer',
    categories: [
      'developer tools',
      'developer tools & devops',
      'databases',
      'server monitoring',
      'security & identity tools',
      'model context protocol',
      'it operations',
    ],
  },
  {
    id: 'business',
    label: 'Business',
    categories: [
      'accounting',
      'crm',
      'customer support',
      'commerce',
      'e-commerce',
      'ecommerce',
      'hr talent & recruitment',
      'human resources',
      'payment processing',
      'proposal & invoice management',
      'sales & crm',
      'taxes',
    ],
  },
  {
    id: 'productivity',
    label: 'Productivity',
    categories: [
      'communication',
      'documents',
      'email',
      'file management & storage',
      'notes',
      'notifications',
      'product management',
      'productivity',
      'productivity & project management',
      'project management',
      'scheduling & booking',
      'spreadsheets',
      'task management',
      'team chat',
      'team collaboration',
      'time tracking software',
      'video conferencing',
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    categories: [
      'ai agents',
      'ai assistants',
      'ai chatbots',
      'ai content generation',
      'ai document extraction',
      'ai meeting assistants',
      'ai models',
      'ai safety compliance detection',
      'ai sales tools',
      'ai web scraping',
      'artificial intelligence',
      'transcription',
    ],
  },
  {
    id: 'content',
    label: 'Content',
    categories: [
      'ads & conversion',
      'analytics',
      'content & files',
      'drip emails',
      'email newsletters',
      'forms & surveys',
      'images & design',
      'marketing',
      'marketing automation',
      'reviews',
      'social media accounts',
      'social media marketing',
      'transactional email',
      'url shortener',
      'video & audio',
      'webinars',
      'website & app building',
      'website builders',
    ],
  },
] as const;

type CategoryGroupId = (typeof CATEGORY_GROUPS)[number]['id'] | 'other';

const groupedCategorySet = new Set(
  CATEGORY_GROUPS.flatMap((group) => group.categories ?? [])
);

function normalizeCategory(category: string | null | undefined) {
  return category?.trim().toLowerCase() || null;
}

function toolkitMatchesCategoryGroup(toolkit: ToolkitSummary, groupId: CategoryGroupId) {
  if (groupId === 'all') return true;

  const category = normalizeCategory(toolkit.category);
  if (groupId === 'other') {
    return category === null || !groupedCategorySet.has(category);
  }

  const group = CATEGORY_GROUPS.find((item) => item.id === groupId);
  return category !== null && group?.categories?.some((item) => item === category) === true;
}

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
  const [search, setSearch] = useState('');
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroupId>('all');
  const deferredSearch = useDeferredValue(search);

  // Get popular toolkits
  const popularToolkits = useMemo(() => {
    return POPULAR_SLUGS
      .map((slug) => toolkits.find((t) => t.slug === slug))
      .filter((t): t is ToolkitSummary => t !== undefined);
  }, []);

  const filteredToolkits = useMemo(() => {
    const searchLower = deferredSearch.toLowerCase();
    return toolkits.filter((toolkit) => {
      if (!toolkitMatchesCategoryGroup(toolkit, categoryGroup)) return false;
      if (!deferredSearch) return true;

      return (
        toolkit.name.toLowerCase().includes(searchLower) ||
        toolkit.slug.toLowerCase().includes(searchLower)
      );
    });
  }, [deferredSearch, categoryGroup]);

  const categoryFilters = useMemo(() => {
    const filters = CATEGORY_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      count: toolkits.filter((toolkit) => toolkitMatchesCategoryGroup(toolkit, group.id)).length,
    }));
    const otherCount = toolkits.filter((toolkit) => toolkitMatchesCategoryGroup(toolkit, 'other')).length;

    return otherCount > 0
      ? [...filters, { id: 'other' as const, label: 'Other', count: otherCount }]
      : filters;
  }, []);

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
            href="https://dashboard.composio.dev/~/project/playground?utm_source=docs&utm_medium=toolkits&utm_campaign=playground"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-background px-3 py-1.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            Playground
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href="https://request.composio.dev/boards/tool-requests"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
          >
            <Grip className="h-3.5 w-3.5" />
            Request Tools
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Cards */}
      <Cards>
        <Card icon={<ShieldCheck />} title="Managed OAuth apps" href="/toolkits/managed-auth" description="Check which toolkits have managed OAuth" />
        <Card icon={<Sparkles />} title="Premium Tools" href="/toolkits/pro-tools" description="Learn about pricing and limits" />
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
          className="h-10 w-full rounded-lg border border-fd-border bg-fd-background pl-10 pr-4 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus-visible:border-blue-500/50 focus-visible:ring-2 focus-visible:ring-blue-500/20"
        />
      </div>

      {/* Results count */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter toolkits by category">
          {categoryFilters.map((filter) => {
            const selected = categoryGroup === filter.id;

            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategoryGroup(filter.id)}
                className={
                  'inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ' +
                  (selected
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'border-fd-border bg-fd-background text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground')
                }
              >
                <span>{filter.label}</span>
                <span className="rounded bg-fd-muted px-1.5 py-0.5 text-xs text-fd-muted-foreground">
                  {filter.count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-fd-muted-foreground">
          {filteredToolkits.length} toolkit{filteredToolkits.length !== 1 ? 's' : ''}
          {deferredSearch && ` matching "${deferredSearch}"`}
          {categoryGroup !== 'all' &&
            ` in ${categoryFilters.find((filter) => filter.id === categoryGroup)?.label ?? 'selected categories'}`}
        </p>
      </div>

      {/* Popular Toolkits - only show when no search */}
      {!deferredSearch && categoryGroup === 'all' && popularToolkits.length > 0 && (
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
            type="button"
            onClick={() => {
              setSearch('');
              setCategoryGroup('all');
            }}
            className="mt-2 text-sm text-fd-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
