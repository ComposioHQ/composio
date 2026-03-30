import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import type { Toolkit, ToolkitSearchResult } from 'src/models/toolkits';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { extractMessage } from 'src/utils/api-error-extraction';
import {
  mergeToolkitData,
  formatToolkitsTable,
  formatToolkitsJson,
  toolkitFromDetailed,
} from '../format';
import { fetchSessionToolkitFallback } from '../session-fallback';
import { TOOLKITS_LIMIT_DESCRIPTION, validateToolkitsLimit } from '../limits';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription(TOOLKITS_LIMIT_DESCRIPTION)
);

const SINGLE_TOOLKIT_QUERY_PATTERN = /^[a-z0-9_-]+$/i;
const SEARCH_EXACT_MATCH_TIMEOUT_MS = 15_000;
const SEARCH_CATALOG_FALLBACK_TIMEOUT_MS = 60_000;
const SEARCH_SESSION_FALLBACK_TIMEOUT_MS = 45_000;

type SearchToolkitsWithFallbackResult = {
  readonly result: ToolkitSearchResult;
  readonly sessionFallbackItems?: ReadonlyArray<SessionToolkitsResponse.Item>;
};

const rankToolkitForFallbackQuery = (toolkit: Toolkit, query: string): number | undefined => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const rankMatch = (value: string) => {
    const normalizedValue = value.toLowerCase();
    if (normalizedValue === normalizedQuery) return 0;
    if (normalizedValue.startsWith(normalizedQuery)) return 1;

    const words = normalizedValue.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some(word => word === normalizedQuery)) return 2;
    if (words.some(word => word.startsWith(normalizedQuery))) return 3;
    if (normalizedValue.includes(normalizedQuery)) return 4;

    return undefined;
  };

  const slugRank = rankMatch(toolkit.slug);
  const nameRank = rankMatch(toolkit.name);
  const descriptionRank = rankMatch(toolkit.meta.description);

  return [slugRank, nameRank, descriptionRank].reduce<number | undefined>(
    (currentBest, candidate) => {
      if (candidate === undefined) return currentBest;
      if (currentBest === undefined) return candidate;
      return Math.min(currentBest, candidate);
    },
    undefined
  );
};

const filterToolkitsForFallbackQuery = (
  toolkits: ReadonlyArray<Toolkit>,
  query: string
): ReadonlyArray<Toolkit> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return toolkits;

  return toolkits
    .map(toolkit => {
      const bestRank = rankToolkitForFallbackQuery(toolkit, normalizedQuery);
      return bestRank === undefined ? undefined : { toolkit, bestRank };
    })
    .filter((value): value is { toolkit: Toolkit; bestRank: number } => value !== undefined)
    .sort((left, right) => {
      if (left.bestRank !== right.bestRank) return left.bestRank - right.bestRank;
      return left.toolkit.slug.localeCompare(right.toolkit.slug);
    })
    .map(({ toolkit }) => toolkit);
};

const buildCatalogResultFromToolkits = (
  toolkits: ReadonlyArray<Toolkit>,
  limit: number
): ToolkitSearchResult => ({
  items: toolkits.slice(0, limit),
  total_items: toolkits.length,
  total_pages: toolkits.length === 0 ? 0 : Math.ceil(toolkits.length / limit),
  next_cursor: null,
});

const getOptionalResultWithTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  timeoutMessage: string,
  failureMessage: string
) =>
  Effect.raceFirst(
    Effect.disconnect(
      effect.pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.logDebug(failureMessage, error).pipe(Effect.as(Option.none<A>()))
        )
      )
    ),
    Effect.disconnect(
      Effect.sleep(timeoutMs).pipe(
        Effect.zipRight(Effect.logDebug(timeoutMessage)),
        Effect.as(Option.none<A>())
      )
    )
  );

const getExactToolkitSearchMatch = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!SINGLE_TOOLKIT_QUERY_PATTERN.test(normalizedQuery)) {
    return Effect.succeed(Option.none<ToolkitSearchResult>());
  }

  return getOptionalResultWithTimeout(
    repo.getToolkitDetailed(normalizedQuery).pipe(
      Effect.map(toolkitFromDetailed),
      Effect.map(toolkit => filterToolkitsForFallbackQuery([toolkit], normalizedQuery)),
      Effect.catchTag('services/HttpServerError', error =>
        error.status === 404 ? Effect.succeed([] as ReadonlyArray<Toolkit>) : Effect.fail(error)
      )
    ),
    SEARCH_EXACT_MATCH_TIMEOUT_MS,
    'Timed out retrieving exact toolkit search fallback.',
    'Failed to retrieve exact toolkit search fallback:'
  ).pipe(
    Effect.map(
      Option.flatMap(items =>
        items.length === 0
          ? Option.none<ToolkitSearchResult>()
          : Option.some(buildCatalogResultFromToolkits(items, limit))
      )
    )
  );
};

const getCatalogToolkitSearchMatch = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) =>
  getOptionalResultWithTimeout(
    repo
      .getToolkits()
      .pipe(Effect.map(toolkits => filterToolkitsForFallbackQuery(toolkits, query))),
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

const shouldUseLocalSearchFallback = (query: string): boolean => {
  const normalizedQuery = query.trim();
  return (
    normalizedQuery.length > 0 &&
    !/\s/.test(normalizedQuery) &&
    SINGLE_TOOLKIT_QUERY_PATTERN.test(normalizedQuery)
  );
};

const searchToolkitsWithFallback = (
  repo: ComposioToolkitsRepository,
  clientSingleton: ComposioClientSingleton,
  query: string,
  limit: number
): Effect.Effect<SearchToolkitsWithFallbackResult, unknown> =>
  Effect.gen(function* () {
    const directResult = yield* repo.searchToolkits({
      search: query,
      limit,
    });

    if (directResult.items.length > 0 || !shouldUseLocalSearchFallback(query)) {
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
        filter: filterToolkitsForFallbackQuery,
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

    const validatedLimit = yield* validateToolkitsLimit(limit);

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
