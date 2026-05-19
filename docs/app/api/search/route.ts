import { createSearchAPI } from 'fumadocs-core/search/server';
import { getDocsSearchIndexes } from '@/lib/search-index';

// Fallback/local search endpoint. Production search uses Algolia from the client
// when NEXT_PUBLIC_ALGOLIA_* variables are configured.
export const { GET } = createSearchAPI('advanced', {
  indexes: getDocsSearchIndexes,
});
