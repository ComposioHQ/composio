import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BrowseResults } from '@/components/kb/browse-results';
import { getKnowledgeByProductArea } from '@/lib/knowledge/catalog';
import {
  getProductArea,
  getProductAreaRedirect,
  isProductAreaSlug,
  PRODUCT_AREAS,
} from '@/lib/knowledge/taxonomy';

interface TopicPageProps {
  params: Promise<{ slug: string }>;
}

export default async function KnowledgeTopicPage({ params }: TopicPageProps) {
  const { slug } = await params;
  const redirect = getProductAreaRedirect(slug);
  if (redirect) permanentRedirect(redirect);
  if (!isProductAreaSlug(slug)) notFound();
  const area = getProductArea(slug);
  const links = await getKnowledgeByProductArea(slug);
  if (!area.defaultBrowse && links.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav aria-label="Knowledge Base topic navigation">
        <Link
          href="/kb"
          className="mb-8 inline-flex items-center gap-2 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Knowledge Base
        </Link>
      </nav>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{area.title}</h1>
        <p className="mt-4 text-base leading-7 text-fd-muted-foreground">{area.description}</p>
      </div>
      <div className="mt-10"><BrowseResults links={links} variant="topic" /></div>
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
