import type { ComponentType } from 'react';
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

interface OpenAPIPageData {
  title: string;
  description?: string;
  getAPIPageProps: () => ApiPageProps;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const referenceSource = await getReferenceSource();
  const page = referenceSource.getPage(slug);
  if (!page) notFound();

  // Check if this is an OpenAPI page (has getAPIPageProps method)
  if ('getAPIPageProps' in page.data) {
    const pageData = page.data as OpenAPIPageData;
    return (
      <DocsPage full tableOfContentPopover={{ enabled: false }}>
        <h1 className="text-2xl font-semibold mb-4">{pageData.title}</h1>
        <PageActions path={page.url} />
        <DocsBody>
          <APIPage {...pageData.getAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  // Regular MDX page - cast to any to avoid complex type issues
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
  return referenceSource.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // Index page - show custom metadata
  if (!slug || slug.length === 0) {
    const ogImage = getOgImageUrl('reference', [], 'API Reference', 'REST API and SDK reference for Composio');
    return {
      title: 'API Reference',
      description: 'REST API and SDK reference for Composio',
      alternates: { canonical: '/reference' },
      openGraph: { images: [ogImage] },
      twitter: { card: 'summary_large_image', images: [ogImage] },
    };
  }

  const referenceSource = await getReferenceSource();
  const page = referenceSource.getPage(slug);
  if (!page) notFound();

  // Use description if available, otherwise fall back to title for SEO
  // This handles OpenAPI pages where description may be null in the spec
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
