import { referenceSource } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const pageSlug = slug.slice(0, -1); // Remove 'image.png'

  // Index page
  if (pageSlug.length === 0) {
    return new ImageResponse(
      <DefaultImage
        title="API Reference"
        description="REST API and SDK reference for Composio"
        site="Composio"
      />,
      {
        width: 1200,
        height: 630,
      },
    );
  }

  const page = referenceSource.getPage(pageSlug);
  if (!page) notFound();

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

export function generateStaticParams() {
  // Index page
  const indexParam = { slug: ['image.png'] };

  // All reference pages
  const pageParams = referenceSource.getPages().map((page) => ({
    slug: [...page.slugs, 'image.png'],
  }));

  return [indexParam, ...pageParams];
}
