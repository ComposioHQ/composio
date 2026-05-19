import { algoliasearch } from 'algoliasearch';
import { sync } from 'fumadocs-core/search/algolia';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const dryRun = process.argv.includes('--dry-run');
const indexName =
  process.env.ALGOLIA_INDEX_NAME ?? process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? 'docs_composio_dev_62hi9pqz1l_pages';

const documents = await getAlgoliaSearchDocuments();

if (documents.length === 0) {
  throw new Error('Refusing to sync an empty Algolia docs index.');
}

if (dryRun) {
  console.log(`Prepared ${documents.length} docs pages for Algolia index "${indexName}".`);
  process.exit(0);
}

const appId = requireEnv(
  'ALGOLIA_APP_ID',
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? '62HI9PQZ1L',
);
const adminApiKey = requireEnv('ALGOLIA_ADMIN_API_KEY');
const client = algoliasearch(appId, adminApiKey);

console.log(`Syncing ${documents.length} docs pages to Algolia index "${indexName}"...`);
await sync(client, {
  indexName,
  documents,
});
console.log(`Synced Algolia docs search index "${indexName}".`);
