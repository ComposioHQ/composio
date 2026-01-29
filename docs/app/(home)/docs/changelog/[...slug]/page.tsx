import { changelogEntries, formatDate, dateToSlug, slugToDate, getOgImageUrl } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageActions } from '@/components/page-actions';

const mdxComponents = getMDXComponents();

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function ChangelogEntryPage({ params }: PageProps) {
  const { slug } = await params;
  const dateStr = slugToDate(slug);

  if (!dateStr) {
    notFound();
  }

  // Find entries matching this date
  const matchingEntries = changelogEntries.filter(
    (entry) => entry.date === dateStr
  );

  if (matchingEntries.length === 0) {
    notFound();
  }

  // Build the path for PageActions (e.g., /docs/changelog/2026/01/07)
  const path = `/docs/changelog/${slug.join('/')}`;

  // If there are multiple entries for the same date, show all of them
  return (
    <DocsPage toc={[]} footer={{ enabled: false }} tableOfContentPopover={{ enabled: false }}>
      <Link
        href="/docs/changelog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Changelog
      </Link>

      <DocsTitle>{formatDate(dateStr)}</DocsTitle>
      <DocsDescription>Latest updates and announcements</DocsDescription>
      <PageActions path={path} />

      <DocsBody>
        <div className="space-y-12">
          {matchingEntries.map((entry) => {
            const Content = entry.body;
            return (
              <article key={`${entry.date}-${entry.title}`}>
                <h2 className="text-2xl font-semibold mb-4">{entry.title}</h2>
                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <Content components={mdxComponents} />
                </div>
              </article>
            );
          })}
        </div>
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  const uniqueDates = new Set<string>();

  for (const entry of changelogEntries) {
    uniqueDates.add(entry.date);
  }

  return Array.from(uniqueDates).map((date) => ({
    slug: dateToSlug(date),
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const dateStr = slugToDate(slug);
  if (!dateStr) return { title: 'Not Found' };

  const matchingEntries = changelogEntries.filter(
    (entry) => entry.date === dateStr
  );

  if (matchingEntries.length === 0) {
    return { title: 'Not Found' };
  }

  const title = matchingEntries.length === 1
    ? matchingEntries[0].title
    : `Changelog - ${formatDate(dateStr)}`;

  const description = `Updates from ${formatDate(dateStr)}`;
  const ogImage = getOgImageUrl('docs', ['changelog', ...slug], title, description);

  return {
    title: `${title} | Composio Changelog`,
    description,
    alternates: { canonical: `/docs/changelog/${slug.join('/')}` },
    openGraph: { images: [ogImage] },
    twitter: { card: 'summary_large_image', images: [ogImage] },
  };
}
