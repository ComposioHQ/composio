import type { MetadataRoute } from 'next';
import {
  source,
  getReferenceSource,
  examplesSource,
  toolkitsSource,
  changelogEntries,
  dateToChangelogUrl,
} from '@/lib/source';
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

  // Changelog pages (deduplicate by date since multiple entries can share the same date)
  const uniqueChangelogDates = [...new Set([...changelogEntries].map((entry) => entry.date))];
  const changelogPages = uniqueChangelogDates.map((date) => ({
    url: `${baseUrl}${dateToChangelogUrl(date)}`,
  }));

  return [
    { url: baseUrl },
    { url: `${baseUrl}/docs/changelog` },
    ...docsPages,
    ...referencePages,
    ...examplesPages,
    ...toolkitsMdxPages,
    ...toolkitsJsonPages,
    ...changelogPages,
  ];
}
