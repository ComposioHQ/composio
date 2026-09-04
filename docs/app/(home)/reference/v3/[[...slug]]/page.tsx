import { getReferenceSource, getOgImageUrl } from '@/lib/source';
import { APIPage } from '@/components/api-page';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { PageActions } from '@/components/page-actions';
import { EditOnGitHub } from '@/components/edit-on-github';
import { extractVersionFromPath } from '@/components/version-badge';
import { ApiPageTitle } from '@/components/api-page-title';
import { isApiPageDeprecated } from '@/lib/api-deprecation';
import { sliceApiPageProps } from '@/lib/openapi-slice';
import {
  openApiReferencePageDataSchema,
  referenceMdxPageDataSchema,
} from '@/lib/reference-page-data';

/**
 * Prepend 'v3' to the slug array since Next.js strips the /v3/ route segment
 * but the source has pages registered under v3/...
 */
function toSourceSlug(slug?: string[]): string[] {
  return ['v3', ...(slug || [])];
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const referenceSource = await getReferenceSource();
  const page = referenceSource.getPage(toSourceSlug(slug));
  if (!page) notFound();

  const openApiData = openApiReferencePageDataSchema.safeParse(page.data);
  if (openApiData.success) {
    const pageData = openApiData.data;
    const apiProps = pageData.getOpenAPIPageProps();
    const detectedVersion = apiProps.operations?.[0]?.path
      ? extractVersionFromPath(apiProps.operations[0].path)
      : null;
    const deprecated = isApiPageDeprecated(pageData, apiProps.operations);
    return (
      <DocsPage full footer={{ enabled: false }} tableOfContentPopover={{ enabled: false }}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <ApiPageTitle title={pageData.title} version={detectedVersion} deprecated={deprecated} />
          <PageActions path={page.url} variant="inline" />
        </div>
        <DocsBody>
          <APIPage {...sliceApiPageProps(apiProps)} />
          <EditOnGitHub path={`docs/content/reference/${page.path}`} />
        </DocsBody>
      </DocsPage>
    );
  }

  const mdxData = referenceMdxPageDataSchema.parse(page.data);
  const MDX = mdxData.body;

  return (
    <DocsPage
      toc={mdxData.toc}
      full={mdxData.full}
      footer={{ enabled: false }}
      tableOfContentPopover={{ enabled: false }}
    >
      <DocsTitle>{mdxData.title}</DocsTitle>
      <PageActions path={page.url} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(referenceSource, page),
          })}
        />
        <EditOnGitHub path={`docs/content/reference/${page.path}`} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const referenceSource = await getReferenceSource();
  const allParams: { slug: string[] }[] = referenceSource.generateParams();
  // Only return params that start with 'v3', with the prefix stripped
  return allParams.filter(p => p.slug[0] === 'v3').map(p => ({ slug: p.slug.slice(1) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sourceSlug = toSourceSlug(slug);

  if (!slug || slug.length === 0) {
    const ogImage = getOgImageUrl(
      'reference',
      [],
      'API Reference (v3)',
      'REST API reference for Composio v3'
    );
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
