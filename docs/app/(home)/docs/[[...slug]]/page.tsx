import { getOgImageUrl, source } from '@/lib/source';
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
import { EditOnGitHub } from '@/components/edit-on-github';
import { LegacyBadge } from '@/components/legacy-badge';
import { ExperimentalBadge } from '@/components/experimental-badge';
import { DocsNextLink } from '@/components/docs-next-link';
import { groupSidebarSections } from '@/lib/group-sidebar-sections';
import { getAdjacentDocsPages } from '@/lib/docs-next-page';
import { sanitizeToc } from '@/lib/sanitize-toc';

const docsNavigationTree = groupSidebarSections(source.pageTree);

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const data = page.data as any;
  const MDX = data.body;
  const isLanding = !params.slug || params.slug.length === 0;
  const adjacentPages = isLanding
    ? {}
    : getAdjacentDocsPages(docsNavigationTree, page.url);

  return (
    <DocsPage
      toc={sanitizeToc(data.toc)}
      full={isLanding ? true : data.full}
      breadcrumb={{ enabled: false }}
      footer={{ enabled: false }}
      tableOfContentPopover={{ enabled: false }}
      tableOfContent={{
        enabled: !isLanding && data.full !== true,
        style: 'clerk',
        header: data.legacy ? <LegacyBadge inline /> : undefined,
      }}
    >
      {!isLanding && (
        <>
          {data.legacy && <LegacyBadge />}
          {data.experimental && <ExperimentalBadge />}
          <DocsTitle>{data.title}</DocsTitle>
          <PageActions path={page.url} />
        </>
      )}
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
        <DocsNextLink previous={adjacentPages.previous} next={adjacentPages.next} />
        {!isLanding && <EditOnGitHub path={`docs/content/docs/${page.path}`} />}
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/docs/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const ogImage = getOgImageUrl('docs', page.slugs, page.data.title, page.data.description);

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: { images: [ogImage] },
    twitter: { card: 'summary_large_image', images: [ogImage] },
  };
}
