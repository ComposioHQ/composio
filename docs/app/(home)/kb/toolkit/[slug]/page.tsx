import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Search, Wrench } from 'lucide-react';
import { BrowseResults } from '@/components/kb/browse-results';
import {
  getKnowledgeByToolkit,
  getKnowledgeToolkitSummaries,
} from '@/lib/knowledge/catalog';
import { getKnowledgeSearchHref } from '@/components/kb/knowledge-search-form';

interface ToolkitPageProps {
  params: Promise<{ slug: string }>;
}

async function getToolkitPageData(slug: string) {
  const summaries = await getKnowledgeToolkitSummaries();
  const toolkit = summaries.find((candidate) => candidate.slug === slug);
  if (!toolkit) return null;
  return { toolkit, links: await getKnowledgeByToolkit(slug) };
}

export default async function KnowledgeToolkitPage({ params }: ToolkitPageProps) {
  const { slug } = await params;
  const data = await getToolkitPageData(slug);
  if (!data) notFound();
  const { toolkit, links } = data;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link href="/kb/toolkits" className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
        <ArrowLeft className="size-4" aria-hidden="true" /> Browse toolkits
      </Link>
      <div className="mt-8 flex max-w-3xl items-start gap-5">
        <span className="flex size-14 shrink-0 items-center justify-center border border-fd-border bg-fd-background">
          {toolkit.logo
            ? <img src={toolkit.logo} alt="" className="size-9 object-contain" />
            : <Wrench className="size-6 text-fd-muted-foreground" aria-hidden="true" />}
        </span>
        <div>
          <p className="text-sm font-medium text-fd-primary">Toolkit knowledge</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{toolkit.name}</h1>
          <p className="mt-3 text-fd-muted-foreground">{links.length} public page{links.length === 1 ? '' : 's'} across Composio sources.</p>
          <Link href={getKnowledgeSearchHref(toolkit.name, 'all')} className="mt-5 inline-flex items-center gap-2 border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
            <Search className="size-4" aria-hidden="true" /> Search for {toolkit.name}
          </Link>
        </div>
      </div>
      <div className="mt-12"><BrowseResults links={links} /></div>
    </main>
  );
}

export async function generateMetadata({ params }: ToolkitPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getToolkitPageData(slug);
  if (!data) return { title: 'Toolkit knowledge not found' };
  return {
    title: `${data.toolkit.name} knowledge`,
    description: `Find public Composio docs, support answers, OAuth guides, examples, and reference pages for ${data.toolkit.name}.`,
    alternates: { canonical: `/kb/toolkit/${data.toolkit.slug}` },
  };
}
