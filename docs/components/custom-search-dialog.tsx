'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { liteClient } from 'algoliasearch/lite';
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
import { BotMessageSquare } from 'lucide-react';
import { toggleDecimalWidget, detectMac } from './ask-ai-button';

function MetaKey() {
  const [key] = useState(() => (detectMac() ? '⌘' : 'Ctrl'));
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

export default function CustomSearchDialog({
  defaultLinks = [],
  api = '/api/search',
  ...props
}: CustomSearchDialogProps) {
  const { locale } = useI18n();
  const clientOptions = useMemo(() => {
    const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
    const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
    const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? 'composio_docs';

    if (appId && searchApiKey) {
      return {
        type: 'algolia' as const,
        client: liteClient(appId, searchApiKey),
        indexName,
        locale,
      };
    }

    return {
      type: 'fetch' as const,
      locale,
      api,
    };
  }, [api, locale]);

  const { search, setSearch, query } = useDocsSearch(clientOptions);

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
        <div className="search-scroll-container max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto">
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
            <SearchDialogList items={query.data === 'empty' ? null : query.data} />
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--composio-orange)] hover:text-[var(--composio-orange)]/80 transition-colors"
            onClick={() => {
              props.onOpenChange(false);
              toggleDecimalWidget();
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
