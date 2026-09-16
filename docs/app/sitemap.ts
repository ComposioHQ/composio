import type { MetadataRoute } from 'next';
import {
  source,
  getReferenceSource,
  examplesSource,
  toolkitsSource,
  knowledgeBaseSource,
  changelogEntries,
  dateToChangelogUrl,
} from '@/lib/source';
import { getAllToolkitsSync } from '@/lib/toolkit-data';
import { getLocalKnowledgeDiscoveryPaths } from '@/lib/knowledge/discovery';

const baseUrl = 'https://docs.composio.dev';

function getChangelogDate(entry: (typeof changelogEntries)[number]): string | null {
  if (typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    return entry.date;
  }

  const filename = entry.info?.path ?? '';
  const match = filename.match(/^(\d{2})-(\d{2})-(\d{2})(?:-|\.)/);
  return match ? `20${match[3]}-${match[1]}-${match[2]}` : null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const knowledgeDiscoveryPaths = await getLocalKnowledgeDiscoveryPaths();
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

  const knowledgeBasePages = knowledgeBaseSource.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
  }));
  const knowledgeDiscoveryPages = knowledgeDiscoveryPaths
    .filter((path) => path !== '/kb/search')
    .map((path) => ({
      url: `${baseUrl}${path}`,
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
  const uniqueChangelogDates = [
    ...new Set(changelogEntries.map(getChangelogDate).filter((date): date is string => date !== null)),
  ];
  const changelogPages = uniqueChangelogDates.map((date) => ({
    url: `${baseUrl}${dateToChangelogUrl(date)}`,
  }));

  const pages = [
    { url: baseUrl },
    { url: `${baseUrl}/docs/changelog` },
    ...docsPages,
    ...referencePages,
    ...examplesPages,
    ...knowledgeBasePages,
    ...knowledgeDiscoveryPages,
    ...toolkitsMdxPages,
    ...toolkitsJsonPages,
    ...changelogPages,
  ];

  return Array.from(new Map(pages.map((page) => [page.url, page])).values());
}
