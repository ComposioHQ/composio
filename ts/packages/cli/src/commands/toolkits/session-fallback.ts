import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import { Effect } from 'effect';
import type { Toolkit } from 'src/models/toolkits';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { toolkitFromSession } from './format';

const SESSION_TOOLKIT_FALLBACK_LIMIT = 50;
const SESSION_TOOLKIT_MAX_PAGES = 10;

export type SessionToolkitFallbackResult = {
  readonly catalogToolkits: ReadonlyArray<Toolkit>;
  readonly sessionItems: ReadonlyArray<SessionToolkitsResponse.Item>;
};

const filterSessionItems = (params: {
  sessionItems: ReadonlyArray<SessionToolkitsResponse.Item>;
  query: string;
  filter: (toolkits: ReadonlyArray<Toolkit>, query: string) => ReadonlyArray<Toolkit>;
}): SessionToolkitFallbackResult => {
  const catalogToolkits = params.filter(params.sessionItems.map(toolkitFromSession), params.query);
  const matchedSlugs = new Set(catalogToolkits.map(toolkit => toolkit.slug.toLowerCase()));

  return {
    catalogToolkits,
    sessionItems: params.sessionItems.filter(item => matchedSlugs.has(item.slug.toLowerCase())),
  };
};

export const fetchSessionToolkitFallback = (params: {
  clientSingleton: ComposioClientSingleton;
  userId: string;
  query: string;
  filter: (toolkits: ReadonlyArray<Toolkit>, query: string) => ReadonlyArray<Toolkit>;
}) =>
  Effect.gen(function* () {
    const client = yield* params.clientSingleton.get();
    const { sessionId } = yield* resolveToolRouterSession(client, params.userId);

    const searchResponse = yield* Effect.tryPromise(() =>
      client.toolRouter.session.toolkits(sessionId, {
        search: params.query,
        limit: SESSION_TOOLKIT_FALLBACK_LIMIT,
      })
    );
    const searchFallback = filterSessionItems({
      sessionItems: searchResponse.items,
      query: params.query,
      filter: params.filter,
    });

    if (searchFallback.catalogToolkits.length > 0) {
      return searchFallback;
    }

    const allItems: Array<SessionToolkitsResponse.Item> = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const response = yield* Effect.tryPromise(() =>
        client.toolRouter.session.toolkits(sessionId, {
          cursor,
          limit: SESSION_TOOLKIT_FALLBACK_LIMIT,
        })
      );
      allItems.push(...response.items);
      cursor = response.next_cursor ?? undefined;
      pageCount++;
    } while (cursor && pageCount < SESSION_TOOLKIT_MAX_PAGES);

    return filterSessionItems({
      sessionItems: allItems,
      query: params.query,
      filter: params.filter,
    });
  });
