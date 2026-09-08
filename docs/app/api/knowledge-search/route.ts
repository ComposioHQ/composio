import {
  isKnowledgeFilter,
} from '@/lib/knowledge/search';
import {
  searchPublicKnowledge,
  type KnowledgeSearchDependencies,
} from '@/lib/knowledge/search-service';

export type { KnowledgeSearchDependencies } from '@/lib/knowledge/search-service';

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export function createKnowledgeSearchHandler(
  dependencies?: KnowledgeSearchDependencies,
): (request: Request) => Promise<Response> {
  return async request => {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
    const requestedFilter = url.searchParams.get('filter') ?? 'all';
    if (!isKnowledgeFilter(requestedFilter)) {
      return json({ error: `Invalid knowledge filter: ${requestedFilter}` }, { status: 400 });
    }
    if (!query) {
      return json({ query: '', filter: requestedFilter, results: [], total: 0 });
    }
    const execution = await searchPublicKnowledge({
      query,
      filter: requestedFilter,
      headers: request.headers,
    }, dependencies);
    return json(execution.response, {
      status: execution.status,
      headers: { 'Cache-Control': execution.cacheControl },
    });
  };
}

export const GET = createKnowledgeSearchHandler();
