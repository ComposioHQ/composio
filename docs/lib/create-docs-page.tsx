import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { PageActions } from '@/components/page-actions';
import { EditOnGitHub } from '@/components/edit-on-github';
import { getOgImageUrl } from '@/lib/source';
import { getKnowledgeDisplayDescription } from '@/lib/knowledge/display';

type Source = typeof import('./source').examplesSource;

export function createDocsPage(source: Source, contentDir: string = 'content/docs') {
  return async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    const MDX = page.data.body;

    return (
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        footer={{ enabled: false }}
        tableOfContentPopover={{ enabled: false }}
      >
        <DocsTitle>{page.data.title}</DocsTitle>
        <PageActions path={page.url} />
        <DocsBody>
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />
          <EditOnGitHub path={`docs/${contentDir}/${page.path}`} />
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

    const description = page.data.description
      ? getKnowledgeDisplayDescription(page.data.description)
      : page.data.description;
    const ogImage = getOgImageUrl(section, page.slugs, page.data.title, description);

    return {
      title: page.data.title,
      description,
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
