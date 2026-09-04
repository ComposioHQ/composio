import Link from 'next/link';
import { ArrowRight, Wrench } from 'lucide-react';
import toolkitsData from '@/public/data/toolkits-list.json';
import type { ToolkitSummary } from '@/types/toolkit';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import { KnowledgeSearchForm } from './knowledge-search-form';

const toolkits = toolkitsData as ToolkitSummary[];
const POPULAR_TOOLKIT_SLUGS = ['github', 'gmail', 'slack', 'notion', 'linear', 'hubspot'];
const popularToolkits = POPULAR_TOOLKIT_SLUGS.flatMap((slug) => {
  const toolkit = toolkits.find((candidate) => candidate.slug === slug);
  return toolkit ? [toolkit] : [];
});

export function KnowledgeHub() {
  const browseAreas = PRODUCT_AREAS.filter((area) => area.defaultBrowse);

  return (
    <main>
      <section className="border-b border-fd-border bg-gradient-to-b from-fd-primary/10 via-fd-muted/30 to-fd-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Search Composio support knowledge</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-fd-muted-foreground sm:text-lg">
              Find public troubleshooting answers, setup guidance, exact errors, and toolkit-specific fixes.
            </p>
          </div>
          <div className="mt-6">
            <KnowledgeSearchForm />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <section id="support-topics" aria-labelledby="support-topics-title">
          <h2 id="support-topics-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Support topics</h2>
          <div className="mt-6 grid gap-px overflow-hidden border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-5">
            {browseAreas.map((area) => (
              <Link key={area.slug} href={`/kb/topic/${area.slug}`} className="group bg-fd-background p-5 transition-colors hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring">
                <h3 className="flex items-center justify-between gap-4 font-semibold">
                  {area.title}
                  <ArrowRight className="size-4 shrink-0 text-fd-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </h3>
                <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">{area.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="toolkits-title">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="toolkits-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Browse by toolkit</h2>
            <Link href="/kb/toolkits" className="inline-flex items-center gap-2 text-sm font-medium hover:text-fd-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
              View all toolkits <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {popularToolkits.map((toolkit) => (
              <Link key={toolkit.slug} href={`/kb/toolkit/${toolkit.slug}`} className="flex items-center gap-3 border border-fd-border p-3 text-sm font-medium transition-colors hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
                {toolkit.logo ? <img src={toolkit.logo} alt="" width={28} height={28} className="size-7 object-contain" /> : <Wrench className="size-7 text-fd-muted-foreground" aria-hidden="true" />}
                <span className="truncate">{toolkit.name.trim()}</span>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
