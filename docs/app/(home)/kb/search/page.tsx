import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { KnowledgeSearchForm } from '@/components/kb/knowledge-search-form';
import { KnowledgeSearchResults } from '@/components/kb/knowledge-search-results';
import { searchPublicKnowledge } from '@/lib/knowledge/search-service';

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
  const execution = await searchPublicKnowledge({
    query,
    filter: 'all',
    headers: await headers(),
  });
  const initialResponse = 'results' in execution.response ? execution.response : null;
  const failed = execution.status !== 200 || initialResponse === null;

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
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Search Composio support knowledge</h1>
        <p className="mt-3 text-fd-muted-foreground">
          Find public troubleshooting answers, setup guidance, exact errors, and toolkit-specific fixes.
        </p>
        <div className="sticky top-14 z-20 -mx-4 mt-7 border-y border-fd-border bg-fd-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <KnowledgeSearchForm defaultQuery={query} compact />
        </div>
      </div>
      <div className="mt-10">
        <KnowledgeSearchResults
          query={query}
          initialResponse={initialResponse}
          failed={failed}
        />
      </div>
    </main>
  );
}
