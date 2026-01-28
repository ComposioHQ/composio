import {
  DocsBody,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { PageActions } from '@/components/page-actions';
import { getOgImageUrl } from '@/lib/source';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Source = any;

export function createDocsPage(source: Source) {
  return async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    const MDX = page.data.body;

    return (
      <DocsPage toc={page.data.toc} full={page.data.full} footer={{ enabled: false }} tableOfContentPopover={{ enabled: false }}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <PageActions path={page.url} />
        <DocsBody>
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
      </DocsPage>
    );
  };
}

export function createGenerateStaticParams(source: Source) {
  return function generateStaticParams() {
    return source.generateParams();
  };
}

export function createGenerateMetadata(source: Source, section: string = 'docs') {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ slug?: string[] }>;
  }): Promise<Metadata> {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    const ogImage = getOgImageUrl(section, page.slugs, page.data.title, page.data.description);

    return {
      title: page.data.title,
      description: page.data.description,
      alternates: { canonical: page.url },
      openGraph: {
        images: [ogImage],
      },
      twitter: {
        card: 'summary_large_image',
        images: [ogImage],
      },
    };
  };
}
