import type { MetadataRoute } from 'next';
import { source, getReferenceSource, examplesSource, toolkitsSource } from '@/lib/source';
import { getAllToolkitsSync } from '@/lib/toolkit-data';

const baseUrl = 'https://docs.composio.dev';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docsPages = source.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
  }));

  // Use async reference source to include OpenAPI-generated API reference pages
  const referenceSource = await getReferenceSource();
  const referencePages = referenceSource.getPages().map((page: { url: string }) => ({
    url: `${baseUrl}${page.url}`,
  }));

  const examplesPages = examplesSource.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
  }));

  // MDX toolkit pages
  const toolkitsMdxPages = toolkitsSource.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
  }));

  // JSON toolkit pages (dynamically generated from toolkits.json)
  const toolkitsJsonPages = getAllToolkitsSync().map((toolkit) => ({
    url: `${baseUrl}/toolkits/${toolkit.slug}`,
  }));

  return [
    { url: baseUrl },
    // The changelog is a single page; per-date URLs only redirect to it.
    { url: `${baseUrl}/reference/changelog` },
    ...docsPages,
    ...referencePages,
    ...examplesPages,
    ...toolkitsMdxPages,
    ...toolkitsJsonPages,
  ];
}
