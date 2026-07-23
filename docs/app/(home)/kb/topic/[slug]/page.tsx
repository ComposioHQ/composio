import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { BrowseResults } from '@/components/kb/browse-results';
import { getKnowledgeByProductArea } from '@/lib/knowledge/catalog';
import { getKnowledgeSearchHref } from '@/components/kb/knowledge-search-form';
import { getProductArea, isProductAreaSlug, PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';

interface TopicPageProps {
  params: Promise<{ slug: string }>;
}

export default async function KnowledgeTopicPage({ params }: TopicPageProps) {
  const { slug } = await params;
  if (!isProductAreaSlug(slug)) notFound();
  const area = getProductArea(slug);
  const links = await getKnowledgeByProductArea(slug);
  if (!area.defaultBrowse && links.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link href="/kb#product-areas" className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
        <ArrowLeft className="size-4" aria-hidden="true" /> Product areas
      </Link>
      <div className="mt-8 max-w-3xl">
        <p className="text-sm font-medium text-fd-primary">Product area</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{area.title}</h1>
        <p className="mt-4 text-base leading-7 text-fd-muted-foreground">{area.description}</p>
        <Link href={getKnowledgeSearchHref(area.title, 'all')} className="mt-6 inline-flex items-center gap-2 border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
          <Search className="size-4" aria-hidden="true" /> Search this topic
        </Link>
      </div>
      <div className="mt-12"><BrowseResults links={links} /></div>
    </main>
  );
}

export function generateStaticParams() {
  return PRODUCT_AREAS.filter((area) => area.defaultBrowse).map((area) => ({ slug: area.slug }));
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isProductAreaSlug(slug)) return { title: 'Knowledge topic not found' };
  const area = getProductArea(slug);
  return {
    title: `${area.title} knowledge`,
    description: area.description,
    alternates: { canonical: `/kb/topic/${area.slug}` },
  };
}
