import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import type { ToolkitSearchResult } from 'src/models/toolkits';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { extractMessage } from 'src/utils/api-error-extraction';
import { formatLimitDescription, validateLimit } from 'src/ui/clamp-limit';
import { mergeToolkitData, formatToolkitsTable, formatToolkitsJson } from '../format';
import { fetchSessionToolkitFallback } from '../session-fallback';
import { getOptionalResultWithTimeout } from '../timeout-helpers';
import {
  isSingleSlugQuery,
  filterToolkitsByQuery,
  buildCatalogResultFromToolkits,
  getExactToolkitMatch,
} from '../toolkit-ranking';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription(formatLimitDescription('Number of results per page'))
);

const SEARCH_EXACT_MATCH_TIMEOUT_MS = 5_000;
const SEARCH_CATALOG_FALLBACK_TIMEOUT_MS = 10_000;
const SEARCH_SESSION_FALLBACK_TIMEOUT_MS = 10_000;

type SearchToolkitsWithFallbackResult = {
  readonly result: ToolkitSearchResult;
  readonly sessionFallbackItems?: ReadonlyArray<SessionToolkitsResponse.Item>;
};

const getExactToolkitSearchMatch = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) =>
  getExactToolkitMatch(
    repo,
    query,
    limit,
    SEARCH_EXACT_MATCH_TIMEOUT_MS,
    'Timed out retrieving exact toolkit search fallback.',
    'Failed to retrieve exact toolkit search fallback:'
  );

const getCatalogToolkitSearchMatch = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) =>
  getOptionalResultWithTimeout(
    repo.getToolkits().pipe(Effect.map(toolkits => filterToolkitsByQuery(toolkits, query))),
    SEARCH_CATALOG_FALLBACK_TIMEOUT_MS,
    'Timed out filtering toolkit fallback results against the local catalog.',
    'Failed to filter toolkit fallback results against the local catalog:'
  ).pipe(
    Effect.map(
      Option.flatMap(items =>
        items.length === 0
          ? Option.none<ToolkitSearchResult>()
          : Option.some(buildCatalogResultFromToolkits(items, limit))
      )
    )
  );

const searchToolkitsWithFallback = (
  repo: ComposioToolkitsRepository,
  clientSingleton: ComposioClientSingleton,
  query: string,
  limit: number
) =>
  Effect.gen(function* () {
    const directResult = yield* repo.searchToolkits({
      search: query,
      limit,
    });

    if (directResult.items.length > 0 || !isSingleSlugQuery(query)) {
      return {
        result: directResult,
      };
    }

    const exactMatchResult = yield* getExactToolkitSearchMatch(repo, query, limit);
    if (Option.isSome(exactMatchResult)) {
      return {
        result: exactMatchResult.value,
      };
    }

    const catalogFallbackResult = yield* getCatalogToolkitSearchMatch(repo, query, limit);
    if (Option.isSome(catalogFallbackResult)) {
      return {
        result: catalogFallbackResult.value,
      };
    }

    const sessionFallback = yield* getOptionalResultWithTimeout(
      fetchSessionToolkitFallback({
        clientSingleton,
        userId: 'default',
        query,
        filter: filterToolkitsByQuery,
      }),
      SEARCH_SESSION_FALLBACK_TIMEOUT_MS,
      'Timed out retrieving toolkit search results from Tool Router session fallback.',
      'Failed to retrieve toolkit search results from Tool Router session fallback:'
    ).pipe(Effect.map(Option.getOrUndefined));

    if (sessionFallback && sessionFallback.catalogToolkits.length > 0) {
      return {
        result: buildCatalogResultFromToolkits(sessionFallback.catalogToolkits, limit),
        sessionFallbackItems: sessionFallback.sessionItems,
      };
    }

    return {
      result: directResult,
    };
  });

// TODO(tool-router-migration): migrate to Tool Router when the session toolkits endpoint
// supports text search. Currently SessionToolsParams has no search capability.

/**
 * Search toolkits by use case.
 *
 * @example
 * ```bash
 * composio dev toolkits search "send emails"
 * composio dev toolkits search "messaging" --limit 5
 * ```
 */
export const toolkitsCmd$Search = Command.make('search', { query, limit }, ({ query, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;
    const clientSingleton = yield* ComposioClientSingleton;

    const validatedLimit = yield* validateLimit(limit);

    const { result, sessionFallbackItems } = yield* ui.withSpinner(
      `Searching toolkits for "${query}"...`,
      searchToolkitsWithFallback(repo, clientSingleton, query, validatedLimit)
    );

    if (result.items.length === 0) {
      yield* ui.log.warn(`No toolkits found matching "${query}". Try broadening your search.`);
      yield* ui.output('[]');
      return;
    }

    const showing = result.items.length;
    const total = result.total_items;

    const unified = mergeToolkitData(result.items, sessionFallbackItems);

    yield* ui.log.info(`Found ${showing} of ${total} toolkits\n\n${formatToolkitsTable(unified)}`);

    // Next step hint
    const firstSlug = unified[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(`To view details:\n> composio dev toolkits info "${firstSlug}"`);
    }

    yield* ui.output(formatToolkitsJson(unified));
  }).pipe(
    Effect.catchAll(error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.error(extractMessage(error) ?? 'An error occurred while searching toolkits.');
        yield* ui.output('[]');
        process.exitCode = 1;
      })
    )
  )
).pipe(Command.withDescription('Search toolkits by use case.'));
