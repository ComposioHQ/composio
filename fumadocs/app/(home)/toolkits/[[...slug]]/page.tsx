import { toolkitsSource } from '@/lib/source';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { ToolkitDetail } from '@/components/toolkits/toolkit-detail';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { getToolkitSummaries, getToolkitBySlug, ToolkitDataError } from '@/lib/toolkit-data';
import type { Metadata } from 'next';

export async function generateStaticParams() {
  // Index page
  const indexParam = { slug: [] };

  // MDX pages
  const mdxParams = toolkitsSource.generateParams();

  // JSON toolkit pages (gracefully handle missing data)
  const toolkits = await getToolkitSummaries();
  const jsonParams = toolkits.map((toolkit) => ({
    slug: [toolkit.slug],
  }));

  return [indexParam, ...mdxParams, ...jsonParams];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;

  // Index page
  if (!slug || slug.length === 0) {
    return {
      title: 'Toolkits',
      description: 'Browse all toolkits supported by Composio',
    };
  }

  // Check MDX first
  const page = toolkitsSource.getPage(slug);
  if (page) {
    return {
      title: page.data.title,
      description: page.data.description,
    };
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkit = await getToolkitBySlug(slug[0]);
    if (toolkit) {
      return {
        title: `${toolkit.name.trim()} - Composio Toolkit`,
        description: toolkit.description,
      };
    }
  }

  return { title: 'Toolkit Not Found' };
}

export default async function ToolkitsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;

  // Index page - show landing with search/filter
  if (!slug || slug.length === 0) {
    const toolkits = await getToolkitSummaries();
    return <ToolkitsLanding toolkits={toolkits} />;
  }

  // Check MDX first
  const page = toolkitsSource.getPage(slug);
  if (page) {
    const MDXContent = page.data.body;
    return (
      <article className="prose prose-fd max-w-none">
        <MDXContent components={getMDXComponents()} />
      </article>
    );
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    try {
      const toolkit = await getToolkitBySlug(slug[0]);

      if (toolkit) {
        return (
          <ToolkitDetail
            toolkit={toolkit}
            tools={toolkit.tools}
            triggers={toolkit.triggers}
          />
        );
      }
    } catch (error) {
      if (error instanceof ToolkitDataError && error.code === 'NOT_GENERATED') {
        return (
          <div className="space-y-5 sm:space-y-8">
            <h1 className="text-2xl font-bold text-fd-foreground sm:text-3xl">Toolkit</h1>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-center">
              <p className="text-fd-foreground">Toolkit data is not available.</p>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                Run <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs">bun run generate:toolkits</code> to generate toolkit data.
              </p>
            </div>
          </div>
        );
      }
      throw error;
    }
  }

  notFound();
}
