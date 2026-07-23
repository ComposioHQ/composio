import Link from 'next/link';
import { ArrowRight, Layers3, Search, Wrench } from 'lucide-react';
import toolkitsData from '@/public/data/toolkits-list.json';
import type { ToolkitSummary } from '@/types/toolkit';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import {
  getFeaturedKnowledgeLinks,
  getKnowledgeByProductArea,
} from '@/lib/knowledge/catalog';
import { KnowledgeSearchForm } from './knowledge-search-form';

const toolkits = toolkitsData as ToolkitSummary[];
const POPULAR_TOOLKIT_SLUGS = ['github', 'gmail', 'slack', 'notion', 'linear', 'hubspot'];
const popularToolkits = POPULAR_TOOLKIT_SLUGS.flatMap((slug) => {
  const toolkit = toolkits.find((candidate) => candidate.slug === slug);
  return toolkit ? [toolkit] : [];
});

const SOURCE_LABELS = ['Docs', 'Knowledge Base', 'OAuth', 'Toolkits', 'Examples', 'Reference', 'Changelog'];

export async function KnowledgeHub() {
  const [featuredLinks, composioForYouLinks] = await Promise.all([
    getFeaturedKnowledgeLinks(),
    getKnowledgeByProductArea('composio-for-you'),
  ]);
  const browseAreas = PRODUCT_AREAS.filter((area) =>
    area.defaultBrowse || (area.slug === 'composio-for-you' && composioForYouLinks.length > 0),
  );

  return (
    <main>
      <section className="border-b border-fd-border bg-gradient-to-b from-fd-muted/40 to-fd-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-fd-primary">
              <Search className="size-4" aria-hidden="true" />
              Composio Knowledge Base
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Search all Composio knowledge</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-fd-muted-foreground sm:text-lg">
              Find the best public answer across product docs, verified support guidance, OAuth setup, toolkits, examples, API reference, and changelog.
            </p>
            <div className="mt-9">
              <KnowledgeSearchForm />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <section id="product-areas" aria-labelledby="product-areas-title">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-fd-primary">Browse by problem</p>
              <h2 id="product-areas-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Product areas</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-px overflow-hidden border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
            {browseAreas.map((area) => (
              <Link key={area.slug} href={`/kb/topic/${area.slug}`} className="group bg-fd-background p-6 transition-colors hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring">
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
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fd-primary">Browse by provider</p>
              <h2 id="toolkits-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Browse by toolkit</h2>
            </div>
            <Link href="/kb/toolkits" className="inline-flex items-center gap-2 text-sm font-medium hover:text-fd-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
              View all toolkits <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {popularToolkits.map((toolkit) => (
              <Link key={toolkit.slug} href={`/kb/toolkit/${toolkit.slug}`} className="flex items-center gap-3 border border-fd-border p-3 text-sm font-medium transition-colors hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
                {toolkit.logo ? <img src={toolkit.logo} alt="" className="size-7 object-contain" /> : <Wrench className="size-7 text-fd-muted-foreground" aria-hidden="true" />}
                <span className="truncate">{toolkit.name.trim()}</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="featured-title">
          <p className="text-sm font-medium text-fd-primary">Common starting points</p>
          <h2 id="featured-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Featured answers and guides</h2>
          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {featuredLinks.map((item) => (
              <a key={item.href} href={item.href} className="group border border-fd-border p-5 transition-colors hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
                <span className="text-xs font-medium text-fd-primary">{item.sourceLabel}</span>
                <h3 className="mt-2 font-semibold group-hover:text-fd-primary">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">{item.description}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="border border-fd-border bg-fd-muted/30 p-6 sm:p-8" aria-labelledby="sources-title">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-fd-primary"><Layers3 className="size-5" aria-hidden="true" /><span className="text-sm font-medium">One search, canonical answers</span></div>
              <h2 id="sources-title" className="mt-3 text-xl font-semibold">Results open the source that owns the answer</h2>
              <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">The Knowledge Base is a discovery layer. Content stays current in its canonical system instead of being copied into another silo.</p>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label="Search sources">
              {SOURCE_LABELS.map((label) => <li key={label} className="border border-fd-border bg-fd-background px-3 py-2 text-sm">{label}</li>)}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
