import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import { Array as Arr, Effect, Option } from 'effect';
import { CommandSurface, directoryTestUserId, namedProject } from 'src/commands/surface';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { ProjectContext } from 'src/services/project-context';
import { reportFailure } from 'src/effects/report-failure';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';
import { extractMessage } from 'src/utils/api-error-extraction';
import {
  formatToolkitsJson,
  formatToolkitsTable,
  mergeToolkitData,
  type UnifiedToolkit,
} from '../format';

export type ToolkitsListParams = {
  readonly query: Option.Option<string>;
  readonly limit: number;
  readonly connected: Option.Option<boolean>;
};

type SessionToolkitItem = SessionToolkitsResponse['items'][number];

/** The user whose connection status the list shows, and the notice printed when it is a fallback. */
export type ToolkitsListUser = {
  readonly id: string;
  readonly fallbackNotice: Option.Option<string>;
};

/**
 * The `dev` group's `--user-id`, then the directory's test user id, then the global one.
 */
export const resolveToolkitsListUser = (candidates: {
  readonly flag: Option.Option<string>;
  readonly projectTestUserId: Option.Option<string>;
  readonly globalTestUserId: Option.Option<string>;
}): Option.Option<ToolkitsListUser> =>
  Option.firstSomeOf([
    Option.map(candidates.flag, id => ({ id, fallbackNotice: Option.none<string>() })),
    Option.map(candidates.projectTestUserId, id => ({
      id,
      fallbackNotice: Option.some(`Using test user id "${id}"`),
    })),
    Option.map(candidates.globalTestUserId, id => ({
      id,
      fallbackNotice: Option.some(`Using global test user id "${id}"`),
    })),
  ]);

/**
 * Applies `--connected` to the merged rows. The filter needs the session's connection data; when a
 * user was resolved but the session returned nothing, the rows are kept and the filter is reported
 * as skipped.
 */
export const applyConnectedFilter = (
  rows: ReadonlyArray<UnifiedToolkit>,
  params: {
    readonly connectedOnly: boolean;
    readonly sessionLoaded: boolean;
    readonly userResolved: boolean;
  }
): { readonly rows: ReadonlyArray<UnifiedToolkit>; readonly filterSkipped: boolean } => {
  if (params.connectedOnly && params.sessionLoaded) {
    return { rows: rows.filter(row => row.connected?.status === 'ACTIVE'), filterSkipped: false };
  }
  return { rows, filterSkipped: params.connectedOnly && params.userResolved };
};

/**
 * Lists the toolkit catalog. When a user is known, the rows also carry that user's connection
 * status, read from a tool router session; a failed session read only drops the status.
 */
export const runToolkitsList = ({ query, limit, connected }: ToolkitsListParams) =>
  Effect.gen(function* () {
    const { userId } = yield* CommandSurface;
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;
    const clientSingleton = yield* ComposioClientSingleton;
    const projectContext = yield* ProjectContext;
    const userContext = yield* ComposioUserContext;

    const clampedLimit = clampLimit(limit);
    // Resolved outside the session lookup, whose failures only drop the connection status.
    const project = yield* namedProject;
    const resolvedProjectContext = yield* projectContext.resolve;
    const user = resolveToolkitsListUser({
      flag: userId,
      projectTestUserId: directoryTestUserId(
        resolvedProjectContext,
        Option.map(project, named => named.projectId)
      ),
      globalTestUserId: userContext.data.testUserId,
    });

    const fallbackNotice = Option.flatMap(user, resolved => resolved.fallbackNotice);
    if (Option.isSome(fallbackNotice)) {
      yield* ui.log.warn(fallbackNotice.value);
      yield* ui.log.message('To show status for a specific user, use `--user-id`.');
    }

    if (Option.isSome(connected) && Option.isNone(user)) {
      yield* ui.log.warn(
        '`--connected` requires a user id. Use `--user-id` or run `composio dev init`.'
      );
    }

    const catalogEffect = repo.searchToolkits({
      search: Option.getOrUndefined(query),
      limit: clampedLimit,
    });

    // The session is created alongside the catalog fetch (saves one round trip); its toolkits
    // call needs the session id, so it runs after.
    const sessionContextEffect = Option.match(user, {
      onNone: () => Effect.succeedNone,
      onSome: resolved =>
        Effect.gen(function* () {
          const client = yield* Option.match(project, {
            onSome: named => Effect.succeed(named.client),
            onNone: () => clientSingleton.get(),
          });
          const { sessionId } = yield* resolveToolRouterSession(client, resolved.id);
          return Option.some({ client, sessionId });
        }).pipe(
          Effect.catch(error =>
            Effect.logDebug('Failed to create session:', error).pipe(Effect.as(Option.none()))
          )
        ),
    });

    const [catalogResult, sessionContext] = yield* ui.withSpinner(
      'Fetching toolkits...',
      Effect.all([catalogEffect, sessionContextEffect], { concurrency: 'unbounded' })
    );

    if (catalogResult.items.length === 0) {
      yield* ui.log.warn('No toolkits found. Try broadening your search.');
      yield* ui.output('[]');
      return;
    }

    // The session items only add connection status to the catalog rows, and a failed or empty
    // read is a silent fallback.
    const sessionItems = yield* Option.match(sessionContext, {
      onNone: () => Effect.succeedNone,
      onSome: ({ client, sessionId }) =>
        client.toolRouter.session
          .toolkits(
            sessionId,
            {
              search: Option.getOrUndefined(query),
              limit: clampedLimit,
              is_connected: Option.getOrUndefined(connected),
            },
            idempotent
          )
          .pipe(
            Effect.map(response => response.items),
            Effect.catch(error =>
              Effect.logDebug('Failed to fetch session toolkits:', error).pipe(
                Effect.as<ReadonlyArray<SessionToolkitItem>>([])
              )
            ),
            Effect.map(Option.liftPredicate(Arr.isReadonlyArrayNonEmpty))
          ),
    });

    const { rows, filterSkipped } = applyConnectedFilter(
      mergeToolkitData(catalogResult.items, Option.getOrUndefined(sessionItems)),
      {
        connectedOnly: Option.getOrElse(connected, () => false),
        sessionLoaded: Option.isSome(sessionItems),
        userResolved: Option.isSome(user),
      }
    );
    if (filterSkipped) {
      yield* ui.log.warn('`--connected` filter could not be applied — session data unavailable.');
    }

    if (rows.length === 0) {
      yield* ui.log.warn('No connected toolkits found. Try without --connected.');
      yield* ui.output('[]');
      return;
    }

    yield* ui.log.info(
      `Listing ${rows.length} of ${catalogResult.total_items} toolkits\n\n${formatToolkitsTable(rows)}`
    );

    const firstSlug = rows[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(
        `To view details of a toolkit:\n> composio dev toolkits info "${firstSlug}"`
      );
    }
    yield* ui.output(formatToolkitsJson(rows));
  }).pipe(
    Effect.catch(error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* reportFailure(
          ui,
          extractMessage(error) ?? 'An error occurred while fetching toolkits.'
        );
        yield* ui.output('[]');
      })
    )
  );
