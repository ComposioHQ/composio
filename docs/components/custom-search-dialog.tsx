'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { liteClient } from 'algoliasearch/lite';
import aa from 'search-insights';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { useDocsSearch } from 'fumadocs-core/search/client';
import type { BaseIndex } from 'fumadocs-core/search/algolia';
import { BotMessageSquare } from 'lucide-react';
import { detectMac } from './ask-ai-button';
import { toggleEveChat } from './eve-chat-store';

function MetaKey() {
  const [key, setKey] = useState('⌘');

  useEffect(() => {
    if (detectMac()) return;

    const id = window.setTimeout(() => setKey('Ctrl'), 0);
    return () => window.clearTimeout(id);
  }, []);

  return key;
}

export interface DefaultLink {
  title: string;
  description: string;
  href: string;
}

interface CustomSearchDialogProps extends SharedProps {
  defaultLinks?: DefaultLink[];
  api?: string;
}

type AlgoliaHit = {
  objectID: string;
  url?: string;
};

type AlgoliaSearchResponse = {
  hits: AlgoliaHit[];
  queryID?: string;
};

type AlgoliaHitMeta = {
  objectID: string;
  position: number;
  queryID?: string;
};

type SearchResultItem = {
  content: unknown;
  breadcrumbs?: unknown[];
};

const SEARCH_BREADCRUMB_LABELS: Record<string, string> = {
  toolkits: 'Toolkit',
  toolkit: 'Toolkit',
  examples: 'Example',
  example: 'Example',
  docs: 'Docs',
  reference: 'Reference',
  'api-reference': 'API Reference',
  changelog: 'Changelog',
};

function normalizeSearchBreadcrumb(value: string): string {
  return SEARCH_BREADCRUMB_LABELS[value.toLowerCase()] ?? value;
}

function normalizeSearchResult<T extends SearchResultItem>(result: T): T {
  if (!result.breadcrumbs) return result;

  const breadcrumbs = result.breadcrumbs.map((breadcrumb) =>
    typeof breadcrumb === 'string' ? normalizeSearchBreadcrumb(breadcrumb) : breadcrumb,
  );

  const content = typeof result.content === 'string' ? result.content.toLowerCase() : null;
  const dedupedBreadcrumbs = breadcrumbs.filter((breadcrumb, index) => {
    if (index !== breadcrumbs.length - 1 || content === null || typeof breadcrumb !== 'string') {
      return true;
    }

    return breadcrumb.toLowerCase() !== content;
  });

  return {
    ...result,
    breadcrumbs: dedupedBreadcrumbs,
  };
}

export default function CustomSearchDialog({
  defaultLinks = [],
  api = '/api/search',
  ...props
}: CustomSearchDialogProps) {
  const { locale } = useI18n();
  const algoliaHitMetaRef = useRef(new Map<string, AlgoliaHitMeta>());
  const insightsInitializedRef = useRef(false);

  const ensureAlgoliaInsights = useCallback((appId: string, searchApiKey: string) => {
    if (insightsInitializedRef.current) return;

    aa('init', {
      appId,
      apiKey: searchApiKey,
      useCookie: true,
    });
    insightsInitializedRef.current = true;
  }, []);

  const clientOptions = useMemo(() => {
    const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? '62HI9PQZ1L';
    const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
    const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? 'docs_composio';

    if (appId && searchApiKey) {
      const client = liteClient(appId, searchApiKey);

      return {
        type: 'algolia' as const,
        client,
        indexName,
        locale,
        onSearch: async (query: string, tag?: string) => {
          ensureAlgoliaInsights(appId, searchApiKey);

          const result = await client.searchForHits<BaseIndex>({
            requests: [
              {
                type: 'default',
                indexName,
                query,
                distinct: true,
                hitsPerPage: 10,
                filters: tag ? `tag:${tag}` : undefined,
                clickAnalytics: true,
              },
            ],
          });
          const response = result.results[0] as AlgoliaSearchResponse;
          const metadata = new Map<string, AlgoliaHitMeta>();

          response.hits.forEach((hit, index) => {
            if (!hit.url || metadata.has(hit.url)) return;
            metadata.set(hit.url, {
              objectID: hit.objectID,
              position: index + 1,
              queryID: response.queryID,
            });
          });

          algoliaHitMetaRef.current = metadata;

          const viewedObjectIDs = Array.from(metadata.values())
            .slice(0, 20)
            .map((hit) => hit.objectID);

          if (viewedObjectIDs.length > 0) {
            aa('viewedObjectIDs', {
              index: indexName,
              eventName: 'Docs Search Results Viewed',
              objectIDs: viewedObjectIDs,
            });
          }

          return result;
        },
      };
    }

    return {
      type: 'fetch' as const,
      locale,
      api,
    };
  }, [api, ensureAlgoliaInsights, locale]);

  const { search, setSearch, query } = useDocsSearch(clientOptions);
  const searchResults = useMemo(() => {
    if (query.data === 'empty' || !query.data) return query.data;
    return query.data.map(normalizeSearchResult);
  }, [query.data]);

  const trackAlgoliaClick = useCallback((href: string) => {
    const url = new URL(href, window.location.origin);
    const path = `${url.pathname}${url.hash}`;
    const hit = algoliaHitMetaRef.current.get(path) ?? algoliaHitMetaRef.current.get(url.pathname);
    const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? 'docs_composio';

    if (!hit) return;

    if (hit.queryID) {
      aa('clickedObjectIDsAfterSearch', {
        index: indexName,
        eventName: 'Docs Search Result Clicked',
        queryID: hit.queryID,
        objectIDs: [hit.objectID],
        positions: [hit.position],
      });
      return;
    }

    aa('clickedObjectIDs', {
      index: indexName,
      eventName: 'Docs Search Result Clicked',
      objectIDs: [hit.objectID],
    });
  }, []);

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent className="max-md:max-h-[calc(100dvh-2rem)] max-md:flex max-md:flex-col">
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <div
          className="search-scroll-container max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto"
          onClickCapture={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest('a[href]');
            const href = anchor?.getAttribute('href');
            if (!href) return;

            trackAlgoliaClick(href);
          }}
        >
          {query.data === 'empty' && defaultLinks.length > 0 ? (
            <div className="flex flex-col p-2">
              {defaultLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => props.onOpenChange(false)}
                  className="rounded-lg px-2.5 py-2 text-start text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
                >
                  <p className="font-medium">{link.title}</p>
                  <p className="text-xs text-fd-muted-foreground">
                    {link.description}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <SearchDialogList items={searchResults === 'empty' ? null : searchResults} />
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--composio-orange)] hover:text-[var(--composio-orange)]/80 transition-colors"
            onClick={() => {
              props.onOpenChange(false);
              toggleEveChat();
            }}
          >
            <BotMessageSquare className="size-3.5" />
            You can also Ask AI
          </button>
          <div className="hidden sm:inline-flex gap-0.5">
            <kbd className="rounded-md border bg-fd-background px-1.5 text-xs text-fd-muted-foreground">
              <MetaKey />
            </kbd>
            <kbd className="rounded-md border bg-fd-background px-1.5 text-xs text-fd-muted-foreground">
              I
            </kbd>
          </div>
        </div>
      </SearchDialogContent>
    </SearchDialog>
  );
}
