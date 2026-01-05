import type { ComponentType } from 'react';
import { referenceSource } from '@/lib/source';
import { APIPage } from '@/components/api-page';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { ApiPageProps } from 'fumadocs-openapi/ui';

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
  const page = referenceSource.getPage(slug);
  if (!page) notFound();

  // Check if this is an OpenAPI page (has getAPIPageProps method)
  if ('getAPIPageProps' in page.data) {
    const pageData = page.data as OpenAPIPageData;
    return (
      <DocsPage full tableOfContentPopover={{ enabled: false }}>
        <h1 className="text-2xl font-semibold mb-4">{pageData.title}</h1>
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
      <DocsDescription>{mdxData.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(referenceSource, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return referenceSource.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = referenceSource.getPage(slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
