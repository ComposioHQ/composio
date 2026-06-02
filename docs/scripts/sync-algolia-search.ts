import { algoliasearch } from 'algoliasearch';
import {
  ALGOLIA_DEFAULT_APP_ID,
  ALGOLIA_DEFAULT_INDEX_NAME,
  getAlgoliaSearchDocuments,
} from '@/lib/search-index';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const dryRun = process.argv.includes('--dry-run');
const showSamples = process.argv.includes('--samples');
const indexName =
  process.env.ALGOLIA_INDEX_NAME ?? process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? ALGOLIA_DEFAULT_INDEX_NAME;

const records = await getAlgoliaSearchDocuments();

if (records.length === 0) {
  throw new Error('Refusing to sync an empty Algolia docs index.');
}

if (dryRun) {
  const uniquePages = new Set(records.map((record) => record.page_id)).size;
  console.log(`Prepared ${records.length} Algolia records across ${uniquePages} docs pages for index "${indexName}".`);

  if (showSamples) {
    console.log(JSON.stringify(records.slice(0, 5), null, 2));
  }

  process.exit(0);
}

const appId = requireEnv(
  'ALGOLIA_APP_ID',
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? ALGOLIA_DEFAULT_APP_ID,
);
const adminApiKey = requireEnv('ALGOLIA_ADMIN_API_KEY');
const client = algoliasearch(appId, adminApiKey);

console.log(`Configuring Algolia index "${indexName}"...`);
await client.setSettings({
  indexName,
  indexSettings: {
    attributeForDistinct: 'page_id',
    attributesToRetrieve: [
      'objectID',
      'title',
      'description',
      'section',
      'content',
      'url',
      'section_id',
      'breadcrumbs',
      'page_id',
      'type',
    ],
    searchableAttributes: [
      'unordered(title)',
      'unordered(keywords)',
      'unordered(slug)',
      'unordered(section)',
      'unordered(headings)',
      'unordered(tool_names)',
      'unordered(tool_slugs)',
      'unordered(description)',
      'unordered(content)',
    ],
    customRanking: [
      'desc(page_rank)',
      'desc(toolkit_popularity)',
      'desc(section_rank)',
      'asc(position)',
    ],
    attributesForFaceting: [
      'filterOnly(type)',
      'filterOnly(lang)',
      'searchable(tags)',
    ],
    attributesToHighlight: ['title', 'section', 'content'],
    attributesToSnippet: ['content:30'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
    ignorePlurals: true,
    minProximity: 1,
    removeStopWords: false,
    removeWordsIfNoResults: 'lastWords',
    typoTolerance: true,
    advancedSyntax: true,
  },
});

console.log(`Replacing ${records.length} records in Algolia index "${indexName}"...`);
await client.replaceAllObjects({
  indexName,
  objects: records.map((record) => ({ ...record })),
});
console.log(`Synced Algolia docs search index "${indexName}".`);
