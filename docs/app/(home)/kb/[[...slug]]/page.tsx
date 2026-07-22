import {
  DocsBody,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { notFound, permanentRedirect } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { PageActions } from '@/components/page-actions';
import { Feedback } from '@/components/feedback';
import { RelatedLinks } from '@/components/related-links';
import { resolveKbAlias } from '@/lib/kb/repository';
import { knowledgeBaseSource } from '@/lib/source';
import {
  createGenerateMetadata,
  createGenerateStaticParams,
} from '@/lib/create-docs-page';

interface KnowledgeBasePageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function KnowledgeBasePage({ params }: KnowledgeBasePageProps) {
  const { slug } = await params;
  const page = knowledgeBaseSource.getPage(slug);
  if (!page) {
    const canonical = resolveKbAlias((slug ?? []).join('/'));
    if (canonical) permanentRedirect(canonical);
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
      <DocsTitle>{page.data.title}</DocsTitle>
      {lastVerifiedAt && (
        <p className="not-prose mt-2 text-xs font-medium text-fd-muted-foreground">
          Last verified {lastVerifiedAt}
        </p>
      )}
      <PageActions path={page.url} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(knowledgeBaseSource, page),
          })}
        />
        {lastVerifiedAt && (
          <div className="not-prose mt-10 border-t border-fd-border pt-6">
            <Feedback page={page.url} />
          </div>
        )}
      </DocsBody>
    </DocsPage>
  );
}

export const generateStaticParams = createGenerateStaticParams(knowledgeBaseSource);
export const generateMetadata = createGenerateMetadata(knowledgeBaseSource, 'kb');
