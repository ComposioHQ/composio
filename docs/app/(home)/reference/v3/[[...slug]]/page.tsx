import { getReferenceSource, getOgImageUrl } from '@/lib/source';
import { APIPage } from '@/components/api-page';
import {
  DocsBody,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { ApiPageProps } from 'fumadocs-openapi/ui';
import { PageActions } from '@/components/page-actions';
import { VersionBadge, extractVersionFromPath } from '@/components/version-badge';

interface OpenAPIPageData {
  title: string;
  description?: string;
  getAPIPageProps: () => ApiPageProps;
}

/**
 * Prepend 'v3' to the slug array since Next.js strips the /v3/ route segment
 * but the source has pages registered under v3/...
 */
function toSourceSlug(slug?: string[]): string[] {
  return ['v3', ...(slug || [])];
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const referenceSource = await getReferenceSource();
  const page = referenceSource.getPage(toSourceSlug(slug));
  if (!page) notFound();

  if ('getAPIPageProps' in page.data) {
    const pageData = page.data as OpenAPIPageData;
    const apiProps = pageData.getAPIPageProps();
    const detectedVersion = apiProps.operations?.[0]?.path
      ? extractVersionFromPath(apiProps.operations[0].path)
      : null;
    return (
      <DocsPage full footer={{ enabled: false }} tableOfContentPopover={{ enabled: false }}>
        <h1 className="text-2xl font-semibold mb-4">
          {pageData.title}
          {detectedVersion && (
            <span className="ml-2 align-middle">
              <VersionBadge version={detectedVersion} />
            </span>
          )}
        </h1>
        <PageActions path={page.url} />
        <DocsBody>
          <APIPage {...apiProps} />
        </DocsBody>
      </DocsPage>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mdxData = page.data as any;
  const MDX = mdxData.body;

  return (
    <DocsPage toc={mdxData.toc} full={mdxData.full} footer={{ enabled: false }} tableOfContentPopover={{ enabled: false }}>
      <DocsTitle>{mdxData.title}</DocsTitle>
      <PageActions path={page.url} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            a: createRelativeLink(referenceSource as any, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const referenceSource = await getReferenceSource();
  const allParams: { slug: string[] }[] = referenceSource.generateParams();
  // Only return params that start with 'v3', with the prefix stripped
  return allParams
    .filter((p) => p.slug[0] === 'v3')
    .map((p) => ({ slug: p.slug.slice(1) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sourceSlug = toSourceSlug(slug);

  if (!slug || slug.length === 0) {
    const ogImage = getOgImageUrl('reference', [], 'API Reference (v3)', 'REST API reference for Composio v3');
    return {
      title: 'API Reference (v3)',
      description: 'REST API reference for Composio v3',
      alternates: { canonical: '/reference/v3' },
      openGraph: { images: [ogImage] },
      twitter: { card: 'summary_large_image', images: [ogImage] },
    };
  }

  const referenceSource = await getReferenceSource();
  const page = referenceSource.getPage(sourceSlug);
  if (!page) notFound();

  const description = page.data.description || page.data.title;
  const ogImage = getOgImageUrl('reference', page.slugs, page.data.title, description);

  return {
    title: page.data.title,
    description,
    alternates: { canonical: page.url },
    openGraph: { images: [ogImage] },
    twitter: { card: 'summary_large_image', images: [ogImage] },
  };
}
