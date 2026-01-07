'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, Sparkles, ArrowRight, Wrench, Zap, Copy, Check, ExternalLink } from 'lucide-react';
import toolkitsData from '@/public/data/toolkits.json';
import type { Toolkit } from '@/types/toolkit';

const toolkits = toolkitsData as Toolkit[];

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

// Get unique categories
const categories = Array.from(
  new Set(toolkits.map((t) => t.category).filter(Boolean))
).sort() as string[];

function ToolkitIcon({ toolkit }: { toolkit: Toolkit }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-fd-border/50 bg-fd-background bg-center bg-no-repeat text-sm font-medium text-fd-muted-foreground sm:h-10 sm:w-10"
      style={toolkit.logo ? {
        backgroundImage: `url(${toolkit.logo})`,
        backgroundSize: '65%',
      } : undefined}
    >
      {!toolkit.logo && toolkit.name.trim().charAt(0).toUpperCase()}
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
      className="inline-flex items-center gap-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
    >
      <span className="max-w-[120px] truncate sm:max-w-none">{slug.toUpperCase()}</span>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function ToolkitRow({ toolkit }: { toolkit: Toolkit }) {
  return (
    <Link
      href={`/toolkits/${toolkit.slug}`}
      className="group flex flex-col gap-2 px-2 py-3 transition-colors hover:bg-fd-accent/30 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:py-2.5"
    >
      {/* Left side: Icon, Name, Slug */}
      <div className="flex items-center gap-3">
        <ToolkitIcon toolkit={toolkit} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="truncate text-sm font-medium text-fd-foreground">{toolkit.name.trim()}</span>
          <CopySlugButton slug={toolkit.slug} />
        </div>
      </div>
      {/* Right side: Counts */}
      <div className="flex items-center gap-3 pl-12 text-xs text-fd-muted-foreground sm:pl-0">
        <span className="flex items-center gap-1">
          <Wrench className="h-3.5 w-3.5" />
          {toolkit.toolCount}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3.5 w-3.5" />
          {toolkit.triggerCount}
        </span>
      </div>
    </Link>
  );
}

export function ToolkitsLanding() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  // Get popular toolkits
  const popularToolkits = useMemo(() => {
    return POPULAR_SLUGS
      .map((slug) => toolkits.find((t) => t.slug === slug))
      .filter((t): t is Toolkit => t !== undefined);
  }, []);

  const filteredToolkits = useMemo(() => {
    let result = toolkits;

    // Filter by category
    if (category !== 'all') {
      result = result.filter((t) => t.category === category);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (toolkit) =>
          toolkit.name.toLowerCase().includes(searchLower) ||
          toolkit.slug.toLowerCase().includes(searchLower) ||
          toolkit.description.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [search, category]);

  // Group by first letter (numbers at end)
  const groupedToolkits = useMemo(() => {
    const groups: Record<string, Toolkit[]> = {};

    // First sort all toolkits alphabetically (trim to handle leading spaces)
    const sorted = [...filteredToolkits].sort((a, b) =>
      a.name.trim().localeCompare(b.name.trim())
    );

    sorted.forEach((toolkit) => {
      const firstChar = toolkit.name.trim().charAt(0).toUpperCase();
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
        <a
          href="https://request.composio.dev/boards/tool-requests"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-500/20 dark:text-orange-400"
        >
          Request a tool
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Premium Tools Card */}
      <Link
        href="/toolkits/premium-tools"
        className="group flex items-center justify-between gap-3 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2.5 transition-all hover:border-orange-500/50 hover:bg-orange-500/10"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="text-sm font-medium text-fd-foreground">Premium Tools</span>
          <span className="hidden text-sm text-fd-muted-foreground sm:inline">— Learn about pricing and limits</span>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-fd-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-orange-500" />
      </Link>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fd-muted-foreground" />
          <input
            type="text"
            placeholder="Search toolkits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-fd-border bg-fd-background pl-10 pr-4 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:border-fd-primary focus:outline-none focus:ring-1 focus:ring-fd-primary"
          />
        </div>

        {/* Category dropdown */}
        <div className="relative w-full sm:w-auto">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 w-full appearance-none rounded-lg border border-fd-border bg-fd-background pl-4 pr-10 text-sm text-fd-foreground focus:border-fd-primary focus:outline-none focus:ring-1 focus:ring-fd-primary sm:w-auto"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fd-muted-foreground" />
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-fd-muted-foreground">
        {filteredToolkits.length} toolkit{filteredToolkits.length !== 1 ? 's' : ''}
        {category !== 'all' && ` in ${category}`}
        {search && ` matching "${search}"`}
      </p>

      {/* Popular Toolkits - only show when no filters */}
      {!search && category === 'all' && popularToolkits.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-fd-muted-foreground">Popular</h2>
          <div className="divide-y divide-fd-border">
            {popularToolkits.map((toolkit) => (
              <ToolkitRow key={toolkit.slug} toolkit={toolkit} />
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
            onClick={() => {
              setSearch('');
              setCategory('all');
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
