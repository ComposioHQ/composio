import process from 'node:process';
import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';
import { extractMessage } from 'src/utils/api-error-extraction';
import { mergeToolkitData, formatToolkitsJson, formatToolkitsTable } from '../format';

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of results per page (1-1000)')
);

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

/**
 * List available toolkits with connection status.
 *
 * Always fetches catalog data (tools_count, triggers_count, latest_version).
 * When a user ID is available (explicit --user-id, project, or global config),
 * also fetches session data to enrich with connection status.
 *
 * @example
 * ```bash
 * composio toolkits list
 * composio toolkits list --query "email"
 * composio toolkits list --connected
 * composio toolkits list --user-id "alice"
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
      const projectContext = yield* ProjectContext;
      const userContext = yield* ComposioUserContext;

      const clampedLimit = clampLimit(limit);
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
          '`--connected` requires a user id. Use `--user-id` or run `composio init`.'
        );
      }

      // Fetch catalog data (always) and session context (when user ID available) in parallel.
      // The session toolkits call depends on the session ID, so it runs after session creation.
      const catalogEffect = repo.searchToolkits({
        search: Option.getOrUndefined(query),
        limit: clampedLimit,
      });

      // Resolve session context in parallel with catalog fetch (saves one round trip).
      const sessionContextEffect = Option.isSome(resolvedUserId)
        ? resolveToolRouterSession(resolvedUserId.value).pipe(
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
            search: Option.getOrUndefined(query),
            limit: clampedLimit,
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
          `To view details of a toolkit:\n> composio toolkits info "${firstSlug}"`
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
