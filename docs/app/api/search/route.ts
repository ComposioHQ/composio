import {
  source,
  toolRouterSource,
  examplesSource,
  toolkitsSource,
} from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

// Note: referenceSource excluded temporarily - it includes OpenAPI pages
// that cause issues with top-level await in serverless environments
const allPages = [
  ...source.getPages(),
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
