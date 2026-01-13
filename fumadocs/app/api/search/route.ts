import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
  toolkitsSource,
} from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

const allPages = [
  ...source.getPages(),
  ...toolRouterSource.getPages(),
  ...referenceSource.getPages(),
  ...examplesSource.getPages(),
  ...toolkitsSource.getPages(),
];

// Use staticGET to pre-build search index at build time
// This avoids runtime OpenAPI loading issues on Vercel serverless
export const { staticGET: GET } = createSearchAPI('advanced', {
  indexes: allPages.map((page) => ({
    id: page.url,
    title: page.data.title ?? 'Untitled',
    description: page.data.description,
    url: page.url,
    structuredData: page.data.structuredData,
    keywords: 'keywords' in page.data ? page.data.keywords : undefined,
  })),
});
