import { toolkitsSource } from '@/lib/source';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { ToolkitDetail } from '@/components/toolkits/toolkit-detail';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Metadata } from 'next';
import type { Toolkit } from '@/types/toolkit';

async function getToolkits(): Promise<Toolkit[]> {
  try {
    const filePath = join(process.cwd(), 'public/data/toolkits.json');
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  // Index page
  const indexParam = { slug: [] };

  // MDX pages
  const mdxParams = toolkitsSource.generateParams();

  // JSON toolkit pages
  const toolkits = await getToolkits();
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
    const toolkits = await getToolkits();
    const toolkit = toolkits.find((t) => t.slug === slug[0]);
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
    return <ToolkitsLanding />;
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
    const toolkitSlug = slug[0];
    const toolkits = await getToolkits();
    const toolkit = toolkits.find((t) => t.slug === toolkitSlug);

    if (toolkit) {
      return (
        <ToolkitDetail
          toolkit={toolkit}
          tools={toolkit.tools}
          triggers={toolkit.triggers}
        />
      );
    }
  }

  notFound();
}
