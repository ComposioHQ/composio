// Use direct imports from collections to avoid top-level await in lib/source.ts
import { docs, reference, cookbooks, toolkits, changelog } from 'fumadocs-mdx:collections/server';
import { createSearchAPI } from 'fumadocs-core/search/server';
import { loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';
import { openapi } from '@/lib/openapi';
import { getAllToolkitsSync } from '@/lib/toolkit-data';

// Create loaders directly here to avoid the problematic lib/source.ts import
const docsSource = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const cookbooksSource = loader({
  baseUrl: '/cookbooks',
  source: cookbooks.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const toolkitsSource = loader({
  baseUrl: '/toolkits',
  source: toolkits.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

// Dynamic toolkit entries from toolkits.json
const mdxToolkitSlugs = new Set(
  toolkitsSource.getPages().map((page) => page.slugs.join('/')),
);

const dynamicToolkitIndexes = getAllToolkitsSync()
  .filter((toolkit) => !mdxToolkitSlugs.has(toolkit.slug))
  .map((toolkit) => ({
    id: `/toolkits/${toolkit.slug}`,
    title: toolkit.name,
    description: toolkit.description,
    url: `/toolkits/${toolkit.slug}`,
    structuredData: { headings: [] as never[], contents: [] as never[] },
    keywords: [toolkit.slug, toolkit.category].filter(Boolean) as string[],
  }));

// Changelog entries
const changelogIndexes = changelog.map((entry) => ({
  id: `/docs/changelog/${entry.date.replace(/-/g, '/')}#${entry.title}`,
  title: entry.title,
  description: entry.description ?? '',
  url: `/docs/changelog/${entry.date.replace(/-/g, '/')}`,
  structuredData: { headings: [] as never[], contents: [] as never[] },
  keywords: ['changelog'],
}));

// Use dynamic indexes to support async OpenAPI page loading
export const { GET } = createSearchAPI('advanced', {
  indexes: async () => {
    // Load OpenAPI pages and build full reference source
    const openapiPages = await openapiSource(openapi, {
      groupBy: 'tag',
      baseDir: 'api-reference',
    });

    const fullReferenceSource = loader({
      baseUrl: '/reference',
      source: multiple({
        mdx: reference.toFumadocsSource(),
        openapi: openapiPages,
      }),
      plugins: [lucideIconsPlugin(), openapiPlugin()],
    });

    const mdxIndexes = [
      ...docsSource.getPages(),
      ...cookbooksSource.getPages(),
      ...toolkitsSource.getPages(),
      ...fullReferenceSource.getPages(),
    ].map((page) => ({
      id: page.url,
      title: page.data.title ?? 'Untitled',
      description: page.data.description,
      url: page.url,
      structuredData: page.data.structuredData,
      keywords: 'keywords' in page.data ? (page.data.keywords as string[]) : undefined,
    }));

    return [...mdxIndexes, ...dynamicToolkitIndexes, ...changelogIndexes];
  },
});
