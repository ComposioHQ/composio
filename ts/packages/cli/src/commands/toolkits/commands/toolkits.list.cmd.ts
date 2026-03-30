import process from 'node:process';
import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { extractMessage } from 'src/utils/api-error-extraction';
import type { Toolkit, ToolkitSearchResult } from 'src/models/toolkits';
import {
  mergeToolkitData,
  formatToolkitsJson,
  formatToolkitsTable,
  toolkitFromDetailed,
} from '../format';
import { TOOLKITS_LIMIT_DESCRIPTION, validateToolkitsLimit } from '../limits';

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription(TOOLKITS_LIMIT_DESCRIPTION)
);

const SINGLE_TOOLKIT_QUERY_PATTERN = /^[a-z0-9_-]+$/i;
const LIST_EXACT_MATCH_TIMEOUT_MS = 15_000;
const LIST_SEARCH_ENDPOINT_CANDIDATE_LIMIT = 50;
const LIST_SEARCH_ENDPOINT_TIMEOUT_MS = 20_000;
const LIST_CATALOG_FALLBACK_TIMEOUT_MS = 60_000;

const connected = Options.boolean('connected').pipe(
  Options.withDescription('Filter to connected toolkits only'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.optional,
  Options.withDescription(
    'User ID for connection status (falls back to project/global test_user_id)'
  )
);

export const filterToolkitsForListQuery = (
  toolkits: ReadonlyArray<Toolkit>,
  query?: string
): ReadonlyArray<Toolkit> => {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) return toolkits;

  const rankMatch = (toolkit: Toolkit): number | undefined => {
    const rankValue = (value: string) => {
      const normalizedValue = value.toLowerCase();
      if (normalizedValue === normalizedQuery) return 0;
      if (normalizedValue.startsWith(normalizedQuery)) return 1;

      const words = normalizedValue.split(/[^a-z0-9]+/).filter(Boolean);
      if (words.some(word => word === normalizedQuery)) return 2;
      if (words.some(word => word.startsWith(normalizedQuery))) return 3;
      if (normalizedValue.includes(normalizedQuery)) return 4;

      return undefined;
    };

    const slugRank = rankValue(toolkit.slug);
    const nameRank = rankValue(toolkit.name);
    const descriptionRank = rankValue(toolkit.meta.description);

    return [slugRank, nameRank, descriptionRank].reduce<number | undefined>(
      (currentBest, candidate) => {
        if (candidate === undefined) return currentBest;
        if (currentBest === undefined) return candidate;
        return Math.min(currentBest, candidate);
      },
      undefined
    );
  };

  return toolkits
    .map(toolkit => {
      const bestRank = rankMatch(toolkit);
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

const getExactToolkitListMatch = (
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
      Effect.map(toolkit => filterToolkitsForListQuery([toolkit], normalizedQuery)),
      Effect.catchTag('services/HttpServerError', error =>
        error.status === 404 ? Effect.succeed([] as ReadonlyArray<Toolkit>) : Effect.fail(error)
      )
    ),
    LIST_EXACT_MATCH_TIMEOUT_MS,
    'Timed out retrieving exact toolkit list match; falling back to broader search.',
    'Failed to retrieve exact toolkit list match; falling back to broader search:'
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

const shouldRequirePreciseListMatch = (query?: string): boolean => {
  const normalizedQuery = query?.trim();
  return (
    normalizedQuery !== undefined &&
    normalizedQuery.length > 0 &&
    !/\s/.test(normalizedQuery) &&
    SINGLE_TOOLKIT_QUERY_PATTERN.test(normalizedQuery)
  );
};

const getCatalogToolkitsWithFallback = (
  repo: ComposioToolkitsRepository,
  query: string | undefined,
  limit: number
) => {
  const fallback = repo.getToolkits().pipe(
    Effect.map(toolkits => filterToolkitsForListQuery(toolkits, query)),
    Effect.map(toolkits => buildCatalogResultFromToolkits(toolkits, limit))
  );

  if (!query) {
    return fallback;
  }

  const emptyResult = buildCatalogResultFromToolkits([], limit);
  const fallbackResult = getOptionalResultWithTimeout(
    fallback,
    LIST_CATALOG_FALLBACK_TIMEOUT_MS,
    'Timed out filtering toolkit list against the full catalog.',
    'Failed to filter toolkit list against the full catalog:'
  ).pipe(Effect.map(option => Option.getOrElse(option, () => emptyResult)));

  const directSearchPreferred = getOptionalResultWithTimeout(
    repo
      .searchToolkits({
        search: query,
        limit: LIST_SEARCH_ENDPOINT_CANDIDATE_LIMIT,
      })
      .pipe(Effect.map(result => filterToolkitsForListQuery(result.items, query))),
    LIST_SEARCH_ENDPOINT_TIMEOUT_MS,
    'Timed out searching toolkits directly for list; waiting on full catalog fallback.',
    'Failed to search toolkits directly for list; waiting on full catalog fallback:'
  ).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.never,
        onSome: items => {
          const hasPreciseMatch = items.some(toolkit => {
            const normalizedQuery = query.trim().toLowerCase();
            const slug = toolkit.slug.toLowerCase();
            const name = toolkit.name.toLowerCase();
            return (
              slug === normalizedQuery ||
              slug.startsWith(normalizedQuery) ||
              name === normalizedQuery ||
              name.startsWith(normalizedQuery)
            );
          });

          if (items.length === 0) {
            return Effect.logDebug(
              'Direct toolkit list search returned no items; waiting on full catalog fallback.'
            ).pipe(Effect.zipRight(Effect.never));
          }

          if (shouldRequirePreciseListMatch(query) && !hasPreciseMatch) {
            return Effect.logDebug(
              'Direct toolkit list search returned only imprecise matches; waiting on full catalog fallback.'
            ).pipe(Effect.zipRight(Effect.never));
          }

          return Effect.succeed(buildCatalogResultFromToolkits(items, limit));
        },
      })
    )
  );

  const exactMatchPreferred = getExactToolkitListMatch(repo, query, limit);
  const broaderSearch = Effect.raceFirst(
    Effect.disconnect(directSearchPreferred),
    Effect.disconnect(fallbackResult)
  );

  if (!shouldRequirePreciseListMatch(query)) {
    return broaderSearch;
  }

  return exactMatchPreferred.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => broaderSearch,
        onSome: result => Effect.succeed(result),
      })
    )
  );
};

/**
 * List available toolkits with connection status.
 *
 * Always fetches catalog data (tools_count, triggers_count, latest_version).
 * When a user ID is available (explicit --user-id, project, or global config),
 * also fetches session data to enrich with connection status.
 *
 * @example
 * ```bash
 * composio dev toolkits list
 * composio dev toolkits list --query "email"
 * composio dev toolkits list --connected
 * composio dev toolkits list --user-id "alice"
 * ```
 */
export const toolkitsCmd$List = Command.make(
  'list',
  { query, limit, connected, userId },
  ({ query, limit, connected, userId }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;
      const clientSingleton = yield* ComposioClientSingleton;
      const projectContext = yield* ProjectContext;
      const userContext = yield* ComposioUserContext;

      const validatedLimit = yield* validateToolkitsLimit(limit);
      const resolvedProjectContext = yield* projectContext.resolve;
      const testUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const globalTestUserId = userContext.data.testUserId;
      const resolvedUserId = Option.match(userId, {
        onSome: value => Option.some(value),
        onNone: () => Option.orElse(testUserId, () => globalTestUserId),
      });
      const usingProjectTestUserId = Option.isNone(userId) && Option.isSome(testUserId);
      const usingGlobalTestUserId =
        Option.isNone(userId) && Option.isNone(testUserId) && Option.isSome(globalTestUserId);

      if (usingProjectTestUserId && Option.isSome(testUserId)) {
        yield* ui.log.warn(`Using test user id "${testUserId.value}"`);
        yield* ui.log.message('To show status for a specific user, use `--user-id`.');
      } else if (usingGlobalTestUserId && Option.isSome(globalTestUserId)) {
        yield* ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
        yield* ui.log.message('To show status for a specific user, use `--user-id`.');
      }

      if (Option.isSome(connected) && Option.isNone(resolvedUserId)) {
        yield* ui.log.warn(
          '`--connected` requires a user id. Use `--user-id` or run `composio dev init`.'
        );
      }

      const queryValue = Option.getOrUndefined(query);

      // Fetch catalog data (always) and session context (when user ID available) in parallel.
      // The session toolkits call depends on the session ID, so it runs after session creation.
      const catalogEffect = getCatalogToolkitsWithFallback(repo, queryValue, validatedLimit);

      // Resolve session context in parallel with catalog fetch (saves one round trip).
      const sessionContextEffect = Option.isSome(resolvedUserId)
        ? Effect.gen(function* () {
            const client = yield* clientSingleton.get();
            return yield* resolveToolRouterSession(client, resolvedUserId.value);
          }).pipe(
            Effect.catchAll(error =>
              Effect.logDebug('Failed to create session:', error).pipe(Effect.as(undefined))
            )
          )
        : Effect.succeed(undefined as undefined);

      const [catalogResult, sessionContext] = yield* ui.withSpinner(
        'Fetching toolkits...',
        Effect.all([catalogEffect, sessionContextEffect], { concurrency: 'unbounded' })
      );

      if (catalogResult.items.length === 0) {
        yield* ui.log.warn('No toolkits found. Try broadening your search.');
        yield* ui.output('[]');
        return;
      }

      // When session context is available, fetch session toolkits for connection status.
      let sessionItems:
        | ReadonlyArray<
            import('@composio/client/resources/tool-router').SessionToolkitsResponse.Item
          >
        | undefined;
      let sessionFailed = false;
      if (sessionContext) {
        const { client, sessionId } = sessionContext;
        sessionItems = yield* Effect.tryPromise(() =>
          client.toolRouter.session.toolkits(sessionId, {
            search: queryValue,
            limit: validatedLimit,
            is_connected: Option.getOrUndefined(connected),
          })
        ).pipe(
          Effect.map(r => r.items),
          Effect.catchAll(error =>
            Effect.logDebug('Failed to fetch session toolkits:', error).pipe(
              Effect.as(
                [] as ReadonlyArray<
                  import('@composio/client/resources/tool-router').SessionToolkitsResponse.Item
                >
              )
            )
          )
        );
        if (sessionItems.length === 0) {
          sessionFailed = true;
          sessionItems = undefined;
        }
      } else if (Option.isSome(resolvedUserId)) {
        // Session creation itself failed (caught in parallel fetch above).
        sessionFailed = true;
      }

      let unified = mergeToolkitData(catalogResult.items, sessionItems);

      // Apply --connected filter client-side: only keep toolkits with an active connection.
      const isConnectedFilter = Option.getOrUndefined(connected);
      if (isConnectedFilter && sessionItems) {
        unified = unified.filter(t => t.connected?.status === 'ACTIVE');
      } else if (isConnectedFilter && sessionFailed) {
        yield* ui.log.warn('`--connected` filter could not be applied — session data unavailable.');
      }

      if (unified.length === 0) {
        yield* ui.log.warn('No connected toolkits found. Try without --connected.');
        yield* ui.output('[]');
        return;
      }

      const showing = unified.length;
      const total = catalogResult.total_items;
      yield* ui.log.info(
        `Listing ${showing} of ${total} toolkits\n\n${formatToolkitsTable(unified)}`
      );

      const firstSlug = unified[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(
          `To view details of a toolkit:\n> composio dev toolkits info "${firstSlug}"`
        );
      }
      yield* ui.output(formatToolkitsJson(unified));
    }).pipe(
      Effect.catchAll(error =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;
          yield* ui.log.error(
            extractMessage(error) ?? 'An error occurred while fetching toolkits.'
          );
          yield* ui.output('[]');
          process.exitCode = 1;
        })
      )
    )
).pipe(Command.withDescription('List available toolkits with connection status.'));
