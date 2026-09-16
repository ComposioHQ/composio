import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ToolkitGrid } from '@/components/kb/toolkit-grid';
import { getKnowledgeToolkitSummaries } from '@/lib/knowledge/catalog';

export const metadata: Metadata = {
  title: 'Browse knowledge by toolkit',
  description: 'Find public Composio knowledge for every supported toolkit.',
  alternates: { canonical: '/kb/toolkits' },
};

export default async function KnowledgeToolkitsPage() {
  const toolkits = await getKnowledgeToolkitSummaries();
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link href="/kb" className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
        <ArrowLeft className="size-4" aria-hidden="true" /> Knowledge Base
      </Link>
      <div className="mt-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Toolkit knowledge</h1>
        <p className="mt-4 text-base leading-7 text-fd-muted-foreground">Choose a toolkit to see its docs, verified support answers, OAuth setup, examples, reference, and changelog in one place.</p>
      </div>
      <div className="mt-10"><ToolkitGrid toolkits={toolkits} /></div>
    </main>
  );
}
