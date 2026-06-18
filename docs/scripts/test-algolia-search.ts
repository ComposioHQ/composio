import { liteClient } from 'algoliasearch/lite';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import { ALGOLIA_DEFAULT_APP_ID, ALGOLIA_DEFAULT_INDEX_NAME } from '@/lib/search-index';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const appId = requireEnv('ALGOLIA_APP_ID', process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? ALGOLIA_DEFAULT_APP_ID);
const searchApiKey = requireEnv(
  'ALGOLIA_SEARCH_API_KEY',
  process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY ?? process.env.ALGOLIA_ADMIN_API_KEY,
);
const indexName = process.env.ALGOLIA_INDEX_NAME ?? process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? ALGOLIA_DEFAULT_INDEX_NAME;
const queries = process.argv.slice(2);

if (queries.length === 0) {
  queries.push(
    'quickstart',
    'oauth auth config',
    'create connected account',
    'gmail send email',
    'tool router session search',
    'webhook verification',
  );
}

const client = liteClient(appId, searchApiKey);

for (const query of queries) {
  const result = await client.searchForHits<AlgoliaDocsRecord>({
    requests: [
      {
        type: 'default',
        indexName,
        query,
        hitsPerPage: 5,
        distinct: true,
        getRankingInfo: true,
        clickAnalytics: true,
      },
    ],
  });

  const response = result.results[0];
  console.log(`\n## ${query}`);
  response.hits.forEach((hit, index) => {
    const section = hit.section ? ` — ${hit.section}` : '';
    const snippet = hit.content.replace(/\s+/g, ' ').slice(0, 180);
    console.log(`${index + 1}. ${hit.title}${section}`);
    console.log(`   ${hit.url}`);
    console.log(`   ${snippet}${snippet.length === 180 ? '…' : ''}`);
  });
}
