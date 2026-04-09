import process from 'node:process';
import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { extractMessage } from 'src/utils/api-error-extraction';
import { formatLimitDescription, validateLimit } from 'src/ui/clamp-limit';
import type { Toolkit, ToolkitSearchResult } from 'src/models/toolkits';
import { mergeToolkitData, formatToolkitsJson, formatToolkitsTable } from '../format';
import { fetchSessionToolkitFallback } from '../session-fallback';
import { getOptionalResultWithTimeout } from '../timeout-helpers';
import {
  isSingleSlugQuery,
  filterToolkitsByQuery,
  buildCatalogResultFromToolkits,
  rankToolkit,
  getExactToolkitMatch,
} from '../toolkit-ranking';

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription(formatLimitDescription('Number of results per page'))
);

const LIST_EXACT_MATCH_TIMEOUT_MS = 5_000;
const LIST_SEARCH_ENDPOINT_CANDIDATE_LIMIT = 50;
const LIST_SEARCH_ENDPOINT_TIMEOUT_MS = 8_000;
const LIST_CATALOG_FALLBACK_TIMEOUT_MS = 10_000;
const LIST_SESSION_FALLBACK_TIMEOUT_MS = 10_000;

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

/** Re-export for tests. */
export { filterToolkitsByQuery as filterToolkitsForListQuery } from '../toolkit-ranking';

const getExactToolkitListMatch = (repo: ComposioToolkitsRepository, query: string, limit: number) =>
  getExactToolkitMatch(
    repo,
    query,
    limit,
    LIST_EXACT_MATCH_TIMEOUT_MS,
    'Timed out retrieving exact toolkit list match; falling back to broader search.',
    'Failed to retrieve exact toolkit list match; falling back to broader search:'
  );

const getCatalogToolkitsWithFallback = (
  repo: ComposioToolkitsRepository,
  query: string | undefined,
  limit: number
) => {
  const fallback = repo.getToolkits().pipe(
    Effect.map(toolkits => filterToolkitsByQuery(toolkits, query)),
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
      .pipe(Effect.map(result => filterToolkitsByQuery(result.items, query))),
    LIST_SEARCH_ENDPOINT_TIMEOUT_MS,
    'Timed out searching toolkits directly for list; waiting on full catalog fallback.',
    'Failed to search toolkits directly for list; waiting on full catalog fallback:'
  ).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.never,
        onSome: items => {
          const hasPreciseMatch = items.some(toolkit => {
            const rank = rankToolkit(toolkit, query);
            return rank !== undefined && rank <= 1; // exact or prefix match
          });

          if (items.length === 0) {
            return Effect.logDebug(
              'Direct toolkit list search returned no items; waiting on full catalog fallback.'
            ).pipe(Effect.zipRight(Effect.never));
          }

          if (isSingleSlugQuery(query) && !hasPreciseMatch) {
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

  if (!isSingleSlugQuery(query)) {
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

      const validatedLimit = yield* validateLimit(limit);
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
        if (queryValue) {
          const fallbackUserId = Option.getOrElse(resolvedUserId, () => 'default');
          const sessionFallback = yield* getOptionalResultWithTimeout(
            fetchSessionToolkitFallback({
              clientSingleton,
              userId: fallbackUserId,
              query: queryValue,
              filter: filterToolkitsByQuery,
            }),
            LIST_SESSION_FALLBACK_TIMEOUT_MS,
            'Timed out retrieving toolkit list from Tool Router session fallback.',
            'Failed to retrieve toolkit list from Tool Router session fallback:'
          ).pipe(Effect.map(Option.getOrUndefined));

          if (sessionFallback && sessionFallback.catalogToolkits.length > 0) {
            const fallbackCatalogResult = buildCatalogResultFromToolkits(
              sessionFallback.catalogToolkits,
              validatedLimit
            );
            const fallbackUnified = mergeToolkitData(
              fallbackCatalogResult.items,
              sessionFallback.sessionItems
            );

            yield* ui.log.info(
              `Listing ${fallbackUnified.length} of ${fallbackCatalogResult.total_items} toolkits\n\n${formatToolkitsTable(fallbackUnified)}`
            );

            const firstSlug = fallbackUnified[0]?.slug;
            if (firstSlug) {
              yield* ui.log.step(
                `To view details of a toolkit:\n> composio dev toolkits info "${firstSlug}"`
              );
            }
            yield* ui.output(formatToolkitsJson(fallbackUnified));
            return;
          }
        }

        yield* ui.log.warn('No toolkits found. Try broadening your search.');
        yield* ui.output('[]');
        return;
      }

      // When session context is available, fetch session toolkits for connection status.
      const sessionData: {
        readonly items: ReadonlyArray<SessionToolkitsResponse.Item> | undefined;
        readonly failed: boolean;
      } = sessionContext
        ? yield* Effect.tryPromise(() =>
            sessionContext.client.toolRouter.session.toolkits(sessionContext.sessionId, {
              search: queryValue,
              limit: validatedLimit,
              is_connected: Option.getOrUndefined(connected),
            })
          ).pipe(
            Effect.map(r =>
              r.items.length > 0
                ? ({ items: r.items, failed: false } as const)
                : ({ items: undefined, failed: true } as const)
            ),
            Effect.catchAll(error =>
              Effect.logDebug('Failed to fetch session toolkits:', error).pipe(
                Effect.as({ items: undefined, failed: true } as const)
              )
            )
          )
        : { items: undefined, failed: Option.isSome(resolvedUserId) };

      let unified = mergeToolkitData(catalogResult.items, sessionData.items);

      // Apply --connected filter client-side: only keep toolkits with an active connection.
      const isConnectedFilter = Option.getOrUndefined(connected);
      if (isConnectedFilter && sessionData.items) {
        unified = unified.filter(t => t.connected?.status === 'ACTIVE');
      } else if (isConnectedFilter && sessionData.failed) {
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
