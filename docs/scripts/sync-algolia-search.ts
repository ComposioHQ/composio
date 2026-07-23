import { algoliasearch } from 'algoliasearch';
import {
  ALGOLIA_DEFAULT_APP_ID,
  ALGOLIA_DEFAULT_INDEX_NAME,
} from '@/lib/search-index';
import {
  buildCompleteSearchReplacement,
  replaceSearchDocuments,
} from '@/lib/knowledge/search-replacement';

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

if (dryRun) {
  const records = await buildCompleteSearchReplacement({ validateExternal: false });
  if (records.length === 0) throw new Error('Refusing to sync an empty Algolia docs index.');
  const uniquePages = new Set(records.map((record) => record.page_id)).size;
  console.log(`Prepared ${records.length} Algolia records across ${uniquePages} docs pages for index "${indexName}".`);
  const sourceCounts = Object.fromEntries(
    Array.from(new Set(records.map((record) => record.source_type))).sort().map((sourceType) => [
      sourceType,
      records.filter((record) => record.source_type === sourceType).length,
    ]),
  );
  console.log(`Source counts: ${JSON.stringify(sourceCounts)}`);

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

console.log('Validating all registered OAuth guides before changing Algolia...');
const records = await replaceSearchDocuments(
  {
    replaceAllObjects: ({ indexName: targetIndex, objects }) => client.replaceAllObjects({
      indexName: targetIndex,
      objects: objects.map((record) => ({ ...record })),
    }),
  },
  indexName,
  {
    beforeReplace: async (preparedRecords) => {
      if (preparedRecords.length === 0) {
        throw new Error('Refusing to sync an empty Algolia docs index.');
      }
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
            'keywords',
            'slug',
            'tool_names',
            'tool_slugs',
            'source_type',
            'canonical_url',
            'product_areas',
            'toolkit_slugs',
            'intents',
            'last_verified_at',
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
            'desc(section_rank)',
          ],
          attributesForFaceting: [
            'filterOnly(type)',
            'filterOnly(source_type)',
            'filterOnly(product_areas)',
            'filterOnly(toolkit_slugs)',
            'filterOnly(intents)',
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
      console.log(`Replacing ${preparedRecords.length} records in Algolia index "${indexName}"...`);
    },
  },
);
console.log(`Synced ${records.length} records to Algolia docs search index "${indexName}".`);
