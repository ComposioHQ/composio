import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import type { Toolkit, ToolkitSearchResult } from 'src/models/toolkits';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { extractMessage } from 'src/utils/api-error-extraction';
import { mergeToolkitData, formatToolkitsTable, formatToolkitsJson } from '../format';
import { TOOLKITS_LIMIT_DESCRIPTION, validateToolkitsLimit } from '../limits';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription(TOOLKITS_LIMIT_DESCRIPTION)
);

const SEARCH_ENDPOINT_CANDIDATE_LIMIT = 50;
const EMPTY_TOOLKIT_SEARCH_FALLBACK_TIMEOUT_MS = 5_000;

const rankToolkitForSearchQuery = (toolkit: Toolkit, query: string): number | undefined => {
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

const filterToolkitsForSearchQuery = (
  toolkits: ReadonlyArray<Toolkit>,
  query: string
): ReadonlyArray<Toolkit> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return toolkits;

  return toolkits
    .map(toolkit => {
      const bestRank = rankToolkitForSearchQuery(toolkit, normalizedQuery);
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

const confirmCatalogSearchFallbackOrEmpty = (
  fallback: Effect.Effect<ToolkitSearchResult, unknown, never>,
  emptyResult: ToolkitSearchResult,
  timeoutMessage: string,
  failureMessage: string
) =>
  Effect.raceFirst(
    fallback,
    Effect.sleep(EMPTY_TOOLKIT_SEARCH_FALLBACK_TIMEOUT_MS).pipe(
      Effect.zipRight(Effect.logDebug(timeoutMessage)),
      Effect.as(emptyResult)
    )
  ).pipe(
    Effect.catchAll(error => Effect.logDebug(failureMessage, error).pipe(Effect.as(emptyResult)))
  );

const searchToolkitsFromCatalog = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) =>
  repo.getToolkits().pipe(
    Effect.map(toolkits => filterToolkitsForSearchQuery(toolkits, query)),
    Effect.map(toolkits => buildCatalogResultFromToolkits(toolkits, limit))
  );

const shouldRequirePreciseSearchMatch = (query: string): boolean => {
  const normalizedQuery = query.trim();
  return (
    normalizedQuery.length > 0 &&
    !/\s/.test(normalizedQuery) &&
    /^[a-z0-9_-]+$/i.test(normalizedQuery)
  );
};

const searchToolkitsWithFallback = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) => {
  const fallback = searchToolkitsFromCatalog(repo, query, limit);

  return repo
    .searchToolkits({
      search: query,
      limit: SEARCH_ENDPOINT_CANDIDATE_LIMIT,
    })
    .pipe(
      Effect.map(result => filterToolkitsForSearchQuery(result.items, query)),
      Effect.flatMap(items => {
        const emptyResult = buildCatalogResultFromToolkits([], limit);
        const hasPreciseMatch = items.some(toolkit => {
          const rank = rankToolkitForSearchQuery(toolkit, query);
          return rank !== undefined && rank <= 1;
        });

        if (items.length === 0) {
          return confirmCatalogSearchFallbackOrEmpty(
            fallback,
            emptyResult,
            'Timed out confirming empty toolkit search against full catalog.',
            'Failed to confirm empty toolkit search against full catalog:'
          );
        }

        if (shouldRequirePreciseSearchMatch(query) && !hasPreciseMatch) {
          return confirmCatalogSearchFallbackOrEmpty(
            fallback,
            emptyResult,
            'Timed out confirming precise toolkit search match against full catalog.',
            'Failed to confirm precise toolkit search match against full catalog:'
          );
        }

        return Effect.succeed(buildCatalogResultFromToolkits(items, limit));
      }),
      Effect.catchAll(error =>
        Effect.logDebug(
          'Failed to search toolkits directly, falling back to full catalog:',
          error
        ).pipe(Effect.flatMap(() => fallback))
      )
    );
};

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

    const validatedLimit = yield* validateToolkitsLimit(limit);

    const result = yield* ui.withSpinner(
      `Searching toolkits for "${query}"...`,
      searchToolkitsWithFallback(repo, query, validatedLimit)
    );

    if (result.items.length === 0) {
      yield* ui.log.warn(`No toolkits found matching "${query}". Try broadening your search.`);
      yield* ui.output('[]');
      return;
    }

    const showing = result.items.length;
    const total = result.total_items;

    const unified = mergeToolkitData(result.items);

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
