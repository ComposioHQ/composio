import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { KnowledgeSearchForm } from '@/components/kb/knowledge-search-form';
import { KnowledgeSearchResults } from '@/components/kb/knowledge-search-results';
import { isKnowledgeFilter } from '@/lib/knowledge/search';

export const metadata: Metadata = {
  title: 'Search Composio knowledge',
  description: 'Search all public Composio product knowledge.',
  robots: { index: false, follow: true },
};

interface KnowledgeSearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function KnowledgeSearchPage({ searchParams }: KnowledgeSearchPageProps) {
  const params = await searchParams;
  const query = first(params.q).slice(0, 200);
  const requestedFilter = first(params.filter) || 'all';
  const filter = isKnowledgeFilter(requestedFilter) ? requestedFilter : 'all';

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link
        href="/kb"
        className="mb-8 inline-flex items-center gap-2 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Knowledge Base
      </Link>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Search all Composio knowledge</h1>
        <p className="mt-3 text-fd-muted-foreground">
          Results can open Docs, Knowledge Base answers, OAuth guides, toolkits, examples, reference, or changelog.
        </p>
        <div className="mt-7">
          <KnowledgeSearchForm defaultQuery={query} defaultFilter={filter} compact />
        </div>
      </div>
      <div className="mt-10">
        <KnowledgeSearchResults query={query} filter={filter} />
      </div>
    </main>
  );
}
