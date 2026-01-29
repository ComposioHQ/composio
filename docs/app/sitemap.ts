import type { MetadataRoute } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  source,
  referenceSource,
  examplesSource,
  toolkitsSource,
  changelogEntries,
  dateToChangelogUrl,
} from '@/lib/source';

const baseUrl = 'https://docs.composio.dev';

interface Toolkit {
  slug: string;
}

function getToolkitsFromJson(): Toolkit[] {
  const filePath = join(process.cwd(), 'public/data/toolkits.json');

  try {
    const data = readFileSync(filePath, 'utf-8');
    const toolkits = JSON.parse(data) as Toolkit[];

    if (!Array.isArray(toolkits)) {
      throw new Error('toolkits.json must contain an array');
    }

    if (toolkits.length === 0) {
      console.warn('[Sitemap] Warning: toolkits.json is empty - toolkit pages will be missing from sitemap');
    }

    return toolkits;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error(`[Sitemap] Toolkits data file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`[Sitemap] Invalid JSON in toolkits.json: ${error.message}`);
    }
    throw error;
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const docsPages = source.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
  }));

  const referencePages = referenceSource.getPages().map((page) => ({
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
  const toolkitsJsonPages = getToolkitsFromJson().map((toolkit) => ({
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
