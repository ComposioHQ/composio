import {
  DocsBody,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { notFound, permanentRedirect } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { getPublishedKbGuides } from '@/lib/kb/repository';
import { PageActions } from '@/components/page-actions';
import { Feedback } from '@/components/feedback';
import {
  KbGuideVerification,
  KbMobileArticleNavigation,
} from '@/components/kb/kb-article-shell';
import { RelatedLinks } from '@/components/related-links';
import { knowledgeBaseSource } from '@/lib/source';
import { createGenerateMetadata } from '@/lib/create-docs-page';

interface KnowledgeBaseGuidePageProps {
  params: Promise<{ slug: string }>;
}

export default async function KnowledgeBaseGuidePage({ params }: KnowledgeBaseGuidePageProps) {
  const { slug } = await params;
  const page = knowledgeBaseSource.getPage(['guide', slug]);
  if (!page) {
    // Consolidated guides keep their old slugs as aliases; readers and crawlers
    // holding an old URL land on the merged page instead of a 404.
    const target = getPublishedKbGuides().find((guide) =>
      guide.aliases.some((alias) => alias.toLowerCase() === slug.toLowerCase()),
    );
    if (target) permanentRedirect(`/kb/guide/${target.slug}`);
    notFound();
  }

  const MDX = page.data.body;
  const lastVerifiedAt = page.data.lastVerifiedAt;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      footer={{ enabled: false }}
      tableOfContentPopover={{ enabled: false }}
      tableOfContent={
        page.data.related?.length
          ? { footer: <RelatedLinks items={page.data.related} /> }
          : undefined
      }
    >
      <KbMobileArticleNavigation />
      <DocsTitle>{page.data.title}</DocsTitle>
      <PageActions path={page.url} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(knowledgeBaseSource, page),
          })}
        />
        {lastVerifiedAt && (
          <div className="not-prose mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-fd-border pt-6">
            <KbGuideVerification lastVerifiedAt={lastVerifiedAt} />
            <Feedback page={page.url} />
          </div>
        )}
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return knowledgeBaseSource.getPages().flatMap((page) =>
    page.slugs.length === 2 && page.slugs[0] === 'guide'
      ? [{ slug: page.slugs[1] }]
      : [],
  );
}

const generateKbMetadata = createGenerateMetadata(knowledgeBaseSource, 'kb');

export async function generateMetadata({ params }: KnowledgeBaseGuidePageProps) {
  const { slug } = await params;
  return generateKbMetadata({ params: Promise.resolve({ slug: ['guide', slug] }) });
}
