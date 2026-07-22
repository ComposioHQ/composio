import { liteClient } from 'algoliasearch/lite';
import {
  ALGOLIA_DEFAULT_APP_ID,
  ALGOLIA_DEFAULT_INDEX_NAME,
  getAlgoliaSearchDocuments,
  type AlgoliaDocsRecord,
} from '@/lib/search-index';
import {
  algoliaFacetFilters,
  isKnowledgeFilter,
  knowledgeSearchResultFromRecord,
  searchKnowledgeRecords,
  type KnowledgeFilter,
  type KnowledgeSearchResponse,
} from '@/lib/knowledge/search';

interface HighlightValue {
  value?: string;
}

type KnowledgeAlgoliaHit = AlgoliaDocsRecord & {
  _snippetResult?: { content?: HighlightValue };
  _highlightResult?: { description?: HighlightValue };
};

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function searchAlgolia(
  query: string,
  filter: KnowledgeFilter,
): Promise<KnowledgeSearchResponse | null> {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? ALGOLIA_DEFAULT_APP_ID;
  const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? ALGOLIA_DEFAULT_INDEX_NAME;
  if (!appId || !searchApiKey || !indexName) return null;

  const client = liteClient(appId, searchApiKey);
  const response = await client.searchForHits<KnowledgeAlgoliaHit>({
    requests: [{
      type: 'default',
      indexName,
      query,
      distinct: true,
      hitsPerPage: 30,
      facetFilters: algoliaFacetFilters(filter),
      attributesToHighlight: ['title', 'description', 'content'],
      attributesToSnippet: ['content:40'],
    }],
  });
  const result = response.results[0];
  const hits = result.hits ?? [];
  const mapped = hits
    .filter((hit) => hit.source_type && hit.canonical_url)
    .filter((hit) => filter !== 'reference' || hit.source_type !== 'legacy' ||
      hit.title.toLowerCase() === query.toLowerCase())
    .map((hit) => knowledgeSearchResultFromRecord(
      hit,
      hit._snippetResult?.content?.value ?? hit._highlightResult?.description?.value,
    ));

  return { query, filter, results: mapped, total: result.nbHits ?? mapped.length };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  const requestedFilter = url.searchParams.get('filter') ?? 'all';
  if (!isKnowledgeFilter(requestedFilter)) {
    return json({ error: `Invalid knowledge filter: ${requestedFilter}` }, { status: 400 });
  }
  if (!query) {
    return json({ query: '', filter: requestedFilter, results: [], total: 0 });
  }

  const algoliaResponse = await searchAlgolia(query, requestedFilter);
  const response = algoliaResponse ?? searchKnowledgeRecords(
    await getAlgoliaSearchDocuments(),
    { query, filter: requestedFilter, limit: 30 },
  );

  return json(response, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' },
  });
}
