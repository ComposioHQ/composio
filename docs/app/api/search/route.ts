import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
  toolkitsSource,
} from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

// Make route static - index is generated at build time, not runtime
export const revalidate = false;

const allPages = [
  ...source.getPages(),
  ...toolRouterSource.getPages(),
  ...referenceSource.getPages(),
  ...examplesSource.getPages(),
  ...toolkitsSource.getPages(),
];

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
