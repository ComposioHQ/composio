import { toolkitsSource } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Toolkit } from '@/types/toolkit';

export const revalidate = false;

async function getToolkits(): Promise<Toolkit[]> {
  const filePath = join(process.cwd(), 'public/data/toolkits.json');
  try {
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as Toolkit[];
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const pageSlug = slug.slice(0, -1); // Remove 'image.png'

  // Check MDX first
  const page = toolkitsSource.getPage(pageSlug);
  if (page) {
    return new ImageResponse(
      <DefaultImage
        title={page.data.title}
        description={page.data.description}
        site="Composio"
      />,
      {
        width: 1200,
        height: 630,
      },
    );
  }

  // Check JSON toolkit
  if (pageSlug.length === 1) {
    const toolkits = await getToolkits();
    const toolkit = toolkits.find((t) => t.slug === pageSlug[0]);
    if (toolkit) {
      return new ImageResponse(
        <DefaultImage
          title={`${toolkit.name?.trim() || toolkit.slug}`}
          description={toolkit.description || 'Composio Toolkit'}
          site="Composio"
        />,
        {
          width: 1200,
          height: 630,
        },
      );
    }
  }

  // Index page
  if (pageSlug.length === 0) {
    return new ImageResponse(
      <DefaultImage
        title="Toolkits"
        description="Browse all toolkits supported by Composio"
        site="Composio"
      />,
      {
        width: 1200,
        height: 630,
      },
    );
  }

  notFound();
}

export async function generateStaticParams() {
  // MDX pages
  const mdxParams = toolkitsSource.getPages().map((page) => ({
    slug: [...page.slugs, 'image.png'],
  }));

  // JSON toolkit pages
  const toolkits = await getToolkits();
  const jsonParams = toolkits.map((toolkit) => ({
    slug: [toolkit.slug, 'image.png'],
  }));

  // Index page
  const indexParam = { slug: ['image.png'] };

  return [indexParam, ...mdxParams, ...jsonParams];
}
