import { examplesSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';
import { ExamplesGallery, type GalleryItem } from '@/components/examples-gallery';

const DocsPage = createDocsPage(examplesSource);

function getGalleryItems(): GalleryItem[] {
  return examplesSource
    .getPages()
    .flatMap((page): GalleryItem[] => {
      const gallery = page.data.gallery;
      if (!gallery) return []; // skip the index and any page without gallery meta
      return [
        {
          title: page.data.title,
          description: page.data.description ?? '',
          href: page.url,
          categories: gallery.categories,
          logos: gallery.logos,
          featured: gallery.featured,
          order: gallery.order,
        },
      ];
    });
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  // The examples index renders a custom featured gallery; nested slugs use the
  // standard docs page renderer.
  if (!slug || slug.length === 0) {
    return <ExamplesGallery items={getGalleryItems()} />;
  }
  return DocsPage({ params: Promise.resolve({ slug }) });
}

export const generateStaticParams = createGenerateStaticParams(examplesSource);
export const generateMetadata = createGenerateMetadata(examplesSource, 'examples');
