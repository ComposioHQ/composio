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

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const referenceSource = await getReferenceSource();
  const page = referenceSource.getPage(slug);
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
  // Exclude v3 pages — those are handled by the /reference/v3/ route
  return allParams.filter(p => p.slug[0] !== 'v3');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    const ogImage = getOgImageUrl(
      'reference',
      [],
      'API Reference',
      'REST API and SDK reference for Composio'
    );
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
