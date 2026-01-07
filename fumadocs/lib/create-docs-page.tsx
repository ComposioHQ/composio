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
import { Feedback } from '@/components/feedback';
import { GitHubEditLink } from '@/components/github-edit-link';

/**
 * Source type for fumadocs loaders
 * Using explicit any with eslint-disable due to complex fumadocs generics
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Source = any;

interface CreateDocsPageOptions {
  /**
   * Base path for GitHub edit links
   * e.g., 'content/docs' for /content/docs/[...slug].mdx
   */
  contentPath?: string;
  /**
   * Whether to show the feedback widget
   * @default true
   */
  showFeedback?: boolean;
  /**
   * Whether to show the GitHub edit link
   * @default true
   */
  showEditLink?: boolean;
}

export function createDocsPage(source: Source, options: CreateDocsPageOptions = {}) {
  const {
    contentPath = 'content/docs',
    showFeedback = true,
    showEditLink = true,
  } = options;

  return async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    const MDX = page.data.body;
    const filePath = slug ? `${contentPath}/${slug.join('/')}.mdx` : `${contentPath}/index.mdx`;

    return (
      <DocsPage toc={page.data.toc} full={page.data.full} footer={{ enabled: false }} tableOfContentPopover={{ enabled: false }}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />

          {/* Page footer with GitHub edit link and feedback */}
          <div className="mt-12 pt-6 border-t border-border">
            {showEditLink && (
              <GitHubEditLink filePath={filePath} />
            )}
            {showFeedback && (
              <Feedback pageId={page.url} />
            )}
          </div>
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

export function createGenerateMetadata(source: Source) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ slug?: string[] }>;
  }): Promise<Metadata> {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    return {
      title: page.data.title,
      description: page.data.description,
    };
  };
}
