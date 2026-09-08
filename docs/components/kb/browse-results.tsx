'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import type { KnowledgeLink } from '@/lib/knowledge/catalog';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';
import { getKnowledgeDisplayDescription } from '@/lib/knowledge/display';

const GROUPS: Array<{ title: string; sourceTypes: KnowledgeSourceType[] }> = [
  { title: 'Docs', sourceTypes: ['docs'] },
  { title: 'Knowledge Base answers', sourceTypes: ['kb'] },
  { title: 'OAuth guides', sourceTypes: ['oauth-guide'] },
  { title: 'Toolkits', sourceTypes: ['toolkit'] },
  { title: 'Examples', sourceTypes: ['example'] },
  { title: 'Reference', sourceTypes: ['reference', 'legacy'] },
  { title: 'Changelog', sourceTypes: ['changelog'] },
];

const INITIAL_GROUP_LIMIT = 12;

const TOOLKIT_SOURCE_LABELS: Partial<Record<KnowledgeSourceType, string>> = {
  kb: 'Support answer',
  'oauth-guide': 'OAuth guide',
  toolkit: 'Toolkit',
};

function KnowledgeResultCard({
  link,
  showSourceLabel = false,
  displayTitle,
}: {
  link: KnowledgeLink;
  showSourceLabel?: boolean;
  displayTitle?: string;
}) {
  const external = /^https?:\/\//.test(link.href);
  const content = <>
      {showSourceLabel && (
        <p className="mb-3 text-xs font-medium text-fd-muted-foreground">
          {TOOLKIT_SOURCE_LABELS[link.sourceType] ?? link.sourceLabel}
        </p>
      )}
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold group-hover:text-fd-primary">{displayTitle ?? link.title}</h3>
        <span className="mt-1 shrink-0">
          <ArrowUpRight className="size-4 text-fd-muted-foreground" aria-hidden="true" />
          {external && <span className="sr-only">opens in a new tab</span>}
        </span>
      </div>
      <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fd-muted-foreground">
        {getKnowledgeDisplayDescription(link.description)}
      </p>
    </>;
  const className = 'group block h-full border border-fd-border bg-fd-background p-5 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring';

  return external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {content}
    </Link>
  );
}

export function filterKnowledgeLinks(links: KnowledgeLink[], query: string): KnowledgeLink[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return links;
  return links.filter((link) => {
    const searchable = [
      link.title,
      link.description,
      link.sourceLabel,
      ...link.productAreas,
      ...link.toolkitSlugs,
    ].join(' ').toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

interface BrowseResultsProps {
  links: KnowledgeLink[];
  variant?: 'default' | 'topic' | 'toolkit';
  toolkitName?: string;
}

export function BrowseResults({ links, variant = 'default', toolkitName }: BrowseResultsProps) {
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const isTopic = variant === 'topic';
  const isToolkit = variant === 'toolkit';
  const filteredLinks = useMemo(
    () => filterKnowledgeLinks(links, query),
    [links, query],
  );
  const normalizedQuery = query.trim();

  if (links.length === 0) {
    return (
      <div className="border border-fd-border p-6 text-sm text-fd-muted-foreground">
        No resources are mapped here yet. Try the unified search or another product area.
      </div>
    );
  }

  if (isToolkit) {
    return (
      <ul
        aria-label="Toolkit knowledge sources"
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
      >
        {links.map((link) => {
          const displayTitle = toolkitName && link.sourceType === 'kb'
            ? `${toolkitName} support & troubleshooting`
            : toolkitName && link.sourceType === 'toolkit'
              ? `${toolkitName} tools reference`
              : undefined;

          return (
            <li key={link.href}>
              <KnowledgeResultCard link={link} showSourceLabel displayTitle={displayTitle} />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      {!isTopic && links.length > INITIAL_GROUP_LIMIT && (
        <div className="mb-8 border border-fd-border bg-fd-muted/20 p-4 sm:flex sm:items-end sm:justify-between sm:gap-6">
          <div className="w-full max-w-xl">
            <label htmlFor="knowledge-browse-search" className="mb-2 block text-sm font-medium">
              Filter answers on this page
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground" aria-hidden="true" />
              <input
                id="knowledge-browse-search"
                name="knowledge-browse-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles, topics, or toolkits"
                autoComplete="off"
                className="h-11 w-full border border-fd-border bg-fd-background pl-10 pr-4 text-sm outline-none placeholder:text-fd-muted-foreground focus-visible:border-fd-primary focus-visible:ring-2 focus-visible:ring-fd-primary/20"
              />
            </div>
          </div>
          <p className="mt-3 shrink-0 text-sm text-fd-muted-foreground sm:mb-3" aria-live="polite">
            {filteredLinks.length} of {links.length} answers
          </p>
        </div>
      )}

      {filteredLinks.length === 0 ? (
        <div className="border border-fd-border bg-fd-muted/20 p-8 text-center text-sm text-fd-muted-foreground">
          No answers match “{normalizedQuery}”.
        </div>
      ) : (
      <div className="space-y-12">
      {GROUPS.map((group) => {
        const matches = filteredLinks.filter((link) => group.sourceTypes.includes(link.sourceType));
        if (matches.length === 0) return null;
        const groupKey = group.title.toLowerCase().replace(/[^a-z]+/g, '-');
        const expanded = normalizedQuery.length > 0 || expandedGroups.includes(groupKey);
        const visibleMatches = expanded ? matches : matches.slice(0, INITIAL_GROUP_LIMIT);
        const remaining = matches.length - visibleMatches.length;
        const title = isTopic && group.sourceTypes.includes('kb')
          ? 'Support answers'
          : group.title;

        return (
          <section key={group.title} aria-labelledby={`group-${groupKey}`}>
            <div className="flex items-baseline justify-between gap-4 border-b border-fd-border pb-3">
              <h2 id={`group-${groupKey}`} className="text-xl font-semibold">
                {title}
              </h2>
              <span className="text-sm text-fd-muted-foreground">{matches.length}</span>
            </div>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {visibleMatches.map((link) => (
                <li key={link.href}>
                  <KnowledgeResultCard link={link} />
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setExpandedGroups((current) => [...current, groupKey])}
                className="mt-4 border border-fd-border px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
              >
                Show {remaining} more
              </button>
            )}
          </section>
        );
      })}
      </div>
      )}
    </div>
  );
}
