import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Wrench } from 'lucide-react';
import { BrowseResults } from '@/components/kb/browse-results';
import {
  getKnowledgeByToolkit,
  getKnowledgeToolkitSummaries,
} from '@/lib/knowledge/catalog';
import { getToolkitKnowledgeRedirect } from '@/lib/knowledge/toolkit-routing';

interface ToolkitPageProps {
  params: Promise<{ slug: string }>;
}

async function getToolkitSummary(slug: string) {
  const summaries = await getKnowledgeToolkitSummaries();
  return summaries.find((candidate) => candidate.slug === slug) ?? null;
}

export default async function KnowledgeToolkitPage({ params }: ToolkitPageProps) {
  const { slug } = await params;
  const toolkit = await getToolkitSummary(slug);
  if (!toolkit) notFound();
  const toolkitRedirect = getToolkitKnowledgeRedirect(toolkit);
  if (toolkitRedirect) redirect(toolkitRedirect);
  const links = await getKnowledgeByToolkit(slug);

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
        </div>
      </div>
      <div className="mt-10">
        <BrowseResults links={links} variant="toolkit" toolkitName={toolkit.name} />
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: ToolkitPageProps): Promise<Metadata> {
  const { slug } = await params;
  const toolkit = await getToolkitSummary(slug);
  if (!toolkit) return { title: 'Toolkit knowledge not found' };
  return {
    title: `${toolkit.name} knowledge`,
    description: `Find public Composio docs, support answers, OAuth guides, examples, and reference pages for ${toolkit.name}.`,
    alternates: { canonical: `/kb/toolkit/${toolkit.slug}` },
  };
}
