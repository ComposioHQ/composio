import { docs, toolRouter, examples, toolkits } from 'fumadocs-mdx:collections/server';
import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { createSearchAPI } from 'fumadocs-core/search/server';

// Create loaders directly to avoid lib/source.ts top-level await
// Note: reference/API docs excluded - they require OpenAPI which has async init issues
const docsSource = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const toolRouterSource = loader({
  baseUrl: '/tool-router',
  source: toolRouter.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const examplesSource = loader({
  baseUrl: '/examples',
  source: examples.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const toolkitsSource = loader({
  baseUrl: '/toolkits',
  source: toolkits.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const allPages = [
  ...docsSource.getPages(),
  ...toolRouterSource.getPages(),
  ...examplesSource.getPages(),
  ...toolkitsSource.getPages(),
];

export const { GET } = createSearchAPI('advanced', {
  indexes: allPages.map((page) => ({
    id: page.url,
    title: page.data.title ?? 'Untitled',
    description: page.data.description,
    url: page.url,
    structuredData: page.data.structuredData,
    keywords: 'keywords' in page.data ? page.data.keywords : undefined,
  })),
});
